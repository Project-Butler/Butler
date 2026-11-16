// Supabase Storage 드라이버(STORAGE_DRIVER=supabase). local.js와 같은 함수 모양이라 서비스·화면은 그대로다.
// 브라우저는 서명 URL로 Storage에 직접 올리고 받는다(계약 6장의 유일한 예외). 이 API는 본문을 주고받지 않는다(servesContent: false).
// 서버만 서비스 키(SUPABASE_SERVICE_ROLE_KEY)로 Storage REST API를 부른다. 키는 응답·로그에 넣지 않는다.
// 버킷은 비공개다. 객체 이름은 local과 같은 toStoragePath()(uploads/<업로드 id>)이고 원본 파일 이름을 쓰지 않는다.
// 요청이 실패하면 503 STORAGE_UNAVAILABLE로 바꾼다(Storage 장애를 500으로 보이지 않게).
import { AppError } from '../../../platform/AppError.js';
import { isStoragePath, matchesDeclaredType, SIGNATURE_PEEK_BYTES, toStoragePath } from '../fileRules.js';

export const DEFAULT_SUPABASE_BUCKET = 'documents';
const REQUEST_TIMEOUT_MS = 10_000;

const storageUnavailable = (step, status) => {
  console.error('[documents] Supabase Storage 요청 실패', step, status);
  return new AppError('STORAGE_UNAVAILABLE', 503, '사진·문서 첨부를 준비 중입니다. 잠시 후 다시 시도해 주세요.');
};

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

// Storage는 없는 객체를 404로, 예전 버전은 400 + { statusCode: '404' }로 알려 준다.
const isNotFound = async (response) => {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  const body = await readJson(response);
  return String(body?.statusCode) === '404' || body?.error === 'not_found';
};

// 응답 본문 앞부분만 읽고 나머지는 받지 않는다(범위 요청을 무시하고 전체를 보내는 경우 대비).
const readHead = async (response, length) => {
  if (!response.body) return Buffer.from(await response.arrayBuffer()).subarray(0, length);
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (received < length) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      received += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, length);
};

// Content-Range: bytes 0-15/12345 → 12345
const totalFromContentRange = (header) => {
  const match = /\/(\d+)$/.exec(header ?? '');
  return match ? Number(match[1]) : null;
};

export const createSupabaseStorage = ({ url, serviceKey, bucket = DEFAULT_SUPABASE_BUCKET, fetchImpl = fetch }) => {
  const storageBase = `${url.replace(/\/+$/, '')}/storage/v1`;
  const bucketPath = encodeURIComponent(bucket);
  const objectPath = (storagePath) => {
    if (!isStoragePath(storagePath)) throw new Error('잘못된 저장 경로');
    return `${bucketPath}/${storagePath}`;
  };

  const request = (pathname, { method = 'GET', headers = {}, body } = {}) =>
    fetchImpl(`${storageBase}${pathname}`, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  // Storage가 돌려준 상대 경로(/object/...?token=)를 브라우저가 바로 쓸 절대 주소로 만든다.
  const toAbsoluteUrl = (relative) => new URL(`${storageBase}${relative.startsWith('/') ? '' : '/'}${relative}`).toString();

  const call = async (step, pathname, options) => {
    try {
      return await request(pathname, options);
    } catch (error) {
      throw storageUnavailable(step, error?.name ?? 'network');
    }
  };

  return {
    kind: 'supabase',
    servesContent: false,

    // 서명 업로드 URL. Supabase는 유효 시간을 정할 수 없고 2시간으로 고정이다(정리 cron 유예가 이보다 길다, service.js).
    // x-upsert를 주지 않아 같은 경로에 두 번 올릴 수 없다 → 확인(confirmObject)이 끝난 파일을 바꿔치기할 수 없다.
    createUploadTarget: async ({ uploadId, mimeType }) => {
      const response = await call('upload-sign', `/object/upload/sign/${objectPath(toStoragePath(uploadId))}`, { method: 'POST' });
      if (!response.ok) throw storageUnavailable('upload-sign', response.status);
      const body = await readJson(response);
      if (typeof body?.url !== 'string') throw storageUnavailable('upload-sign', 'no-url');
      return { uploadUrl: toAbsoluteUrl(body.url), method: 'PUT', headers: { 'Content-Type': mimeType } };
    },

    // 서명 다운로드 URL(만료 시각까지). download 인자를 붙이지 않아 브라우저가 바로 보여 준다(local의 inline과 같다).
    createDownloadUrl: async ({ storagePath, expiresAt }) => {
      const expiresIn = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
      const response = await call('download-sign', `/object/sign/${objectPath(storagePath)}`, { method: 'POST', body: { expiresIn } });
      if (!response.ok) throw storageUnavailable('download-sign', response.status);
      const body = await readJson(response);
      if (typeof body?.signedURL !== 'string') throw storageUnavailable('download-sign', 'no-url');
      return toAbsoluteUrl(body.signedURL);
    },

    // 파일이 있고 크기·형식이 맞는지(local과 같은 검사). 없으면 false. 앞부분만 범위 요청으로 받는다.
    confirmObject: async ({ storagePath, sizeBytes, mimeType }) => {
      const response = await call('confirm', `/object/authenticated/${objectPath(storagePath)}`, {
        headers: { Range: `bytes=0-${SIGNATURE_PEEK_BYTES - 1}` },
      });
      if (await isNotFound(response)) return false;
      // 빈 파일은 범위를 만족할 수 없다(416). 크기 0은 업로드 세션에서 받지 않는다.
      if (response.status === 416) return false;
      if (response.status !== 206 && response.status !== 200) throw storageUnavailable('confirm', response.status);
      const total = response.status === 206
        ? totalFromContentRange(response.headers.get('content-range'))
        : Number(response.headers.get('content-length'));
      const head = await readHead(response, SIGNATURE_PEEK_BYTES);
      if (total === null || !Number.isFinite(total) || total !== Number(sizeBytes)) return false;
      return matchesDeclaredType(head, mimeType);
    },

    // 이미 없어도 성공(여러 개 삭제 API는 없는 이름을 건너뛴다).
    deleteObject: async (storagePath) => {
      objectPath(storagePath);
      const response = await call('delete', `/object/${bucketPath}`, { method: 'DELETE', body: { prefixes: [storagePath] } });
      if (!response.ok && !(await isNotFound(response))) throw storageUnavailable('delete', response.status);
    },
  };
};

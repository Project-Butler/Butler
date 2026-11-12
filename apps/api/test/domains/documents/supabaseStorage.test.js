// Supabase Storage 드라이버 단위 테스트. 실제 Storage를 부르지 않고 fetch를 목으로 바꾼다.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { toStoragePath } from '../../../src/domains/documents/fileRules.js';
import { createSupabaseStorage } from '../../../src/domains/documents/storage/supabase.js';

const URL_BASE = 'https://proj.supabase.co';
const KEY = 'service-key';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// 응답을 차례로 돌려주고 받은 요청을 기록하는 fetch 목
const mockFetch = (...responses) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  return { calls, fetchImpl };
};

const makeStorage = (fetchImpl, bucket) => createSupabaseStorage({ url: `${URL_BASE}/`, serviceKey: KEY, bucket, fetchImpl });

test('supabase: 업로드 서명 URL은 Storage가 준 경로를 절대 주소로 돌려주고 upsert를 켜지 않는다', async () => {
  const uploadId = randomUUID();
  const signed = `/object/upload/sign/documents/uploads/${uploadId}?token=abc`;
  const { calls, fetchImpl } = mockFetch(jsonResponse(200, { url: signed, token: 'abc' }));
  const target = await makeStorage(fetchImpl).createUploadTarget({ uploadId, mimeType: 'image/png', expiresAt: new Date() });

  assert.deepEqual(target, { uploadUrl: `${URL_BASE}/storage/v1${signed}`, method: 'PUT', headers: { 'Content-Type': 'image/png' } });
  assert.equal(calls[0].url, `${URL_BASE}/storage/v1/object/upload/sign/documents/uploads/${uploadId}`);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.apikey, KEY);
  assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
  assert.equal(calls[0].headers['x-upsert'], undefined);
  // 응답에 서비스 키가 들어가지 않는다
  assert.equal(JSON.stringify(target).includes(KEY), false);
});

test('supabase: 버킷 이름을 바꿀 수 있다', async () => {
  const uploadId = randomUUID();
  const { calls, fetchImpl } = mockFetch(jsonResponse(200, { url: '/object/upload/sign/x?token=t' }));
  await makeStorage(fetchImpl, 'butler-files').createUploadTarget({ uploadId, mimeType: 'image/png' });
  assert.equal(calls[0].url, `${URL_BASE}/storage/v1/object/upload/sign/butler-files/uploads/${uploadId}`);
});

test('supabase: 다운로드 서명 URL은 남은 시간(초)으로 발급하고 inline으로 연다', async () => {
  const storagePath = toStoragePath(randomUUID());
  const signed = `/object/sign/documents/${storagePath}?token=xyz`;
  const { calls, fetchImpl } = mockFetch(jsonResponse(200, { signedURL: signed }));
  const url = await makeStorage(fetchImpl).createDownloadUrl({
    documentId: randomUUID(),
    storagePath,
    fileName: '계약서.pdf',
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });

  assert.equal(url, `${URL_BASE}/storage/v1${signed}`);
  assert.equal(url.includes('download='), false);
  assert.equal(calls[0].url, `${URL_BASE}/storage/v1/object/sign/documents/${storagePath}`);
  assert.ok(calls[0].body.expiresIn >= 299 && calls[0].body.expiresIn <= 300);
});

test('supabase: 업로드 확인은 앞부분만 범위 요청으로 받아 크기·형식을 본다', async () => {
  const storagePath = toStoragePath(randomUUID());
  const partial = (head, total) => () =>
    new Response(head, { status: 206, headers: { 'Content-Range': `bytes 0-${head.length - 1}/${total}` } });
  const { calls, fetchImpl } = mockFetch(
    partial(JPEG, 5000),
    partial(JPEG, 5000),
    partial(JPEG, 4999),
    // 범위를 무시하고 전체를 보내도 앞부분만 읽는다
    () => new Response(Buffer.concat([JPEG, Buffer.alloc(100)]), { status: 200, headers: { 'Content-Length': '116' } }),
  );
  const storage = makeStorage(fetchImpl);

  assert.equal(await storage.confirmObject({ storagePath, sizeBytes: 5000n, mimeType: 'image/jpeg' }), true);
  assert.equal(calls[0].url, `${URL_BASE}/storage/v1/object/authenticated/documents/${storagePath}`);
  assert.equal(calls[0].headers.Range, 'bytes=0-15');
  // 형식이 다르면
  assert.equal(await storage.confirmObject({ storagePath, sizeBytes: 5000n, mimeType: 'image/png' }), false);
  // 크기가 다르면
  assert.equal(await storage.confirmObject({ storagePath, sizeBytes: 5000n, mimeType: 'image/jpeg' }), false);
  assert.equal(await storage.confirmObject({ storagePath, sizeBytes: 116n, mimeType: 'image/jpeg' }), true);
});

test('supabase: 아직 올리지 않은 파일은 확인 실패(false), Storage 장애는 503', async () => {
  const storagePath = toStoragePath(randomUUID());
  const { fetchImpl } = mockFetch(
    jsonResponse(404, { statusCode: '404', error: 'not_found' }),
    // 예전 Storage는 없는 객체를 400으로 알려 준다
    jsonResponse(400, { statusCode: '404', error: 'not_found', message: 'Object not found' }),
    new Response(null, { status: 416 }),
    jsonResponse(400, { statusCode: '403', error: 'Unauthorized' }),
    jsonResponse(500, { error: 'internal' }),
    new Error('network down'),
  );
  const storage = makeStorage(fetchImpl);
  const confirm = () => storage.confirmObject({ storagePath, sizeBytes: 10n, mimeType: 'image/jpeg' });

  assert.equal(await confirm(), false);
  assert.equal(await confirm(), false);
  assert.equal(await confirm(), false);
  await assert.rejects(confirm(), { code: 'STORAGE_UNAVAILABLE' });
  await assert.rejects(confirm(), { code: 'STORAGE_UNAVAILABLE' });
  await assert.rejects(confirm(), { code: 'STORAGE_UNAVAILABLE' });
});

test('supabase: 서명 URL 발급 실패는 503 STORAGE_UNAVAILABLE', async () => {
  const { fetchImpl } = mockFetch(jsonResponse(400, { error: 'Bucket not found' }), jsonResponse(200, {}), jsonResponse(500, {}));
  const storage = makeStorage(fetchImpl);
  await assert.rejects(storage.createUploadTarget({ uploadId: randomUUID(), mimeType: 'image/png' }), { code: 'STORAGE_UNAVAILABLE' });
  await assert.rejects(storage.createUploadTarget({ uploadId: randomUUID(), mimeType: 'image/png' }), { code: 'STORAGE_UNAVAILABLE' });
  await assert.rejects(
    storage.createDownloadUrl({ storagePath: toStoragePath(randomUUID()), expiresAt: new Date(Date.now() + 60_000) }),
    { code: 'STORAGE_UNAVAILABLE' },
  );
});

test('supabase: 삭제는 여러 개 삭제 API로 하고, 이미 없어도 성공한다', async () => {
  const storagePath = toStoragePath(randomUUID());
  const { calls, fetchImpl } = mockFetch(jsonResponse(200, []), jsonResponse(404, { statusCode: '404' }), jsonResponse(500, {}));
  const storage = makeStorage(fetchImpl);

  await storage.deleteObject(storagePath);
  assert.equal(calls[0].url, `${URL_BASE}/storage/v1/object/documents`);
  assert.equal(calls[0].method, 'DELETE');
  assert.deepEqual(calls[0].body, { prefixes: [storagePath] });
  await storage.deleteObject(storagePath);
  await assert.rejects(storage.deleteObject(storagePath), { code: 'STORAGE_UNAVAILABLE' });
});

test('supabase: 업로드 id 모양이 아닌 경로는 Storage를 부르기 전에 거절한다', async () => {
  const { calls, fetchImpl } = mockFetch();
  const storage = makeStorage(fetchImpl);
  await assert.rejects(storage.deleteObject('../other-bucket/x'));
  await assert.rejects(storage.confirmObject({ storagePath: 'uploads/../../x', sizeBytes: 1n, mimeType: 'image/jpeg' }));
  await assert.rejects(storage.createDownloadUrl({ storagePath: '', expiresAt: new Date() }));
  assert.equal(calls.length, 0);
});

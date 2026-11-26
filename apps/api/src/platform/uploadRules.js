// 업로드 규칙 한 곳(DB 의존 없음). 계약 6장 "파일 · 문서".
// 형식 묶음(IMAGE·PDF·VIDEO)마다 MIME·확장자·파일 앞부분 검사·최대 크기·유효 시간을 두고,
// resourceType마다 어떤 묶음을 받는지 정한다(표에 없는 곳은 IMAGE·PDF, 기본 거부).
// 회사가 바꾸는 값은 환경 변수로 받는다(요청마다 다시 읽는다 — storage/index.js와 같은 방식).
//   UPLOAD_MAX_DOCUMENT_MB      사진·PDF 최대 크기(기본 20)
//   UPLOAD_MAX_VIDEO_MB         동영상 최대 크기(기본 50, Supabase Free 업로드 상한)
//   UPLOAD_VIDEO_RESOURCE_TYPES 동영상을 받는 곳(쉼표 구분, 비우면 기본 OWNERSHIP,CONTRACT,TICKET,THREAD_MESSAGE, none이면 동영상 끔)
// 저장소(Supabase 버킷·프로젝트 전역 업로드 한도)보다 크게 두면 저장소 업로드가 실패한다(README).
import { AppError } from './AppError.js';

const MB = 1024 * 1024;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
// 환경 변수로 받을 수 있는 최대 크기(5GB, Supabase Pro 파일당 상한보다 작게).
export const MAX_CONFIGURABLE_MB = 5120;

export const KNOWN_RESOURCE_TYPES = ['PROPERTY', 'OWNERSHIP', 'CONTRACT', 'TICKET', 'MANAGEMENT_LOG', 'THREAD_MESSAGE', 'RENEWAL_NOTICE'];
// 대화 메시지(THREAD_MESSAGE)도 동영상을 받는다(2026-11-26, docs/19).
export const DEFAULT_VIDEO_RESOURCE_TYPES = ['OWNERSHIP', 'CONTRACT', 'TICKET', 'THREAD_MESSAGE'];
// 표에 없는 곳이 받는 묶음
export const DEFAULT_FILE_KINDS = ['IMAGE', 'PDF'];

const startsWith = (buffer, bytes, offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((byte, index) => buffer[offset + index] === byte);
const ascii = (text) => [...text].map((char) => char.charCodeAt(0));
const ftypBrand = (buffer) => (startsWith(buffer, ascii('ftyp'), 4) ? buffer.subarray(8, 12).toString('latin1') : null);

// HEIF 계열 ftyp brand. HEIC는 변환하지 않고 그대로 받는다(결정 Q3).
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
// MP4·MOV가 함께 받는 major brand. HEIF 집합과 겹치지 않는다. M4A(오디오)·3GP 등은 받지 않는다(필요하면 여기에 추가).
// MOV(qt)와 MP4는 브라우저가 서로 바꿔 보내는 일이 많아 같은 집합을 쓴다. ftyp 없이 시작하는 오래된 QuickTime은 받지 않는다.
const VIDEO_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'qt  ']);

const isHeif = (buffer) => HEIF_BRANDS.has(ftypBrand(buffer));
const isVideo = (buffer) => VIDEO_BRANDS.has(ftypBrand(buffer));

// 형식별 파일 앞부분(매직 바이트) 검사. 확장자·브라우저가 보낸 형식은 믿지 않는다.
const SIGNATURES = {
  'image/jpeg': (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  'image/png': (buffer) => startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (buffer) => startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8),
  'image/heic': isHeif,
  'image/heif': isHeif,
  'application/pdf': (buffer) => startsWith(buffer, ascii('%PDF-')),
  'video/mp4': isVideo,
  'video/quicktime': isVideo,
};

// 매직 바이트 검사에 필요한 앞부분 길이(ftyp major brand는 8~12바이트)
export const SIGNATURE_PEEK_BYTES = 16;

// 선언한 형식과 파일 앞부분이 맞는지
export const matchesDeclaredType = (buffer, mimeType) => Boolean(SIGNATURES[mimeType]?.(buffer));

// 묶음 표. maxMbEnv가 있으면 그 환경 변수로 바꾼다.
export const FILE_KINDS = {
  IMAGE: {
    label: 'JPEG·PNG·WEBP·HEIC 사진',
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
    maxMbEnv: 'UPLOAD_MAX_DOCUMENT_MB',
    defaultMaxMb: 20,
    uploadSessionTtlMs: 15 * MINUTE,
    viewUrlTtlMs: 5 * MINUTE,
    unattachedTtlMs: 24 * HOUR,
  },
  PDF: {
    label: 'PDF',
    mimeTypes: ['application/pdf'],
    extensions: ['pdf'],
    maxMbEnv: 'UPLOAD_MAX_DOCUMENT_MB',
    defaultMaxMb: 20,
    uploadSessionTtlMs: 15 * MINUTE,
    viewUrlTtlMs: 5 * MINUTE,
    unattachedTtlMs: 24 * HOUR,
  },
  // 동영상은 크고 오래 본다: 업로드 30분, 재생 주소 60분. 미연결 동영상은 저장 공간을 지키려고 6시간 뒤 정리한다.
  VIDEO: {
    label: 'MP4·MOV 동영상',
    mimeTypes: ['video/mp4', 'video/quicktime'],
    extensions: ['mp4', 'mov', 'm4v'],
    maxMbEnv: 'UPLOAD_MAX_VIDEO_MB',
    defaultMaxMb: 50,
    uploadSessionTtlMs: 30 * MINUTE,
    viewUrlTtlMs: 60 * MINUTE,
    unattachedTtlMs: 6 * HOUR,
  },
};
export const FILE_KIND_NAMES = Object.keys(FILE_KINDS);

// 같은 잘못된 값으로 요청마다 경고하지 않게 한 번만 남긴다.
const warned = new Set();
const warnOnce = (key, message) => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[uploadRules] ${message}`);
};

const readMb = (env, name, fallback) => {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_CONFIGURABLE_MB) {
    warnOnce(`${name}=${raw}`, `${name} 값이 1~${MAX_CONFIGURABLE_MB} 정수가 아니어서 기본값 ${fallback}MB를 씁니다.`);
    return fallback;
  }
  return value;
};

// 없거나 비우면 기본 목록(.env.example을 그대로 복사해도 기본값), none이면 동영상 끔. 모르는 값은 빼고 경고한다.
const readVideoResourceTypes = (env) => {
  const raw = env.UPLOAD_VIDEO_RESOURCE_TYPES;
  if (raw === undefined || raw.trim() === '') return [...DEFAULT_VIDEO_RESOURCE_TYPES];
  if (raw.trim().toLowerCase() === 'none') return [];
  const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
  const unknown = values.filter((value) => !KNOWN_RESOURCE_TYPES.includes(value));
  if (unknown.length > 0) warnOnce(`UPLOAD_VIDEO_RESOURCE_TYPES=${raw}`, `UPLOAD_VIDEO_RESOURCE_TYPES의 모르는 값을 뺍니다: ${unknown.join(', ')}`);
  return [...new Set(values.filter((value) => KNOWN_RESOURCE_TYPES.includes(value)))];
};

// 요청마다 부른다. 돌려주는 값: { kinds: { IMAGE|PDF|VIDEO: { label, mimeTypes, extensions, maxBytes, ...TtlMs } }, resourceKinds }
export const getUploadRules = (env = process.env) => {
  const kinds = Object.fromEntries(
    Object.entries(FILE_KINDS).map(([name, { maxMbEnv, defaultMaxMb, ...kind }]) => [
      name,
      { ...kind, maxBytes: readMb(env, maxMbEnv, defaultMaxMb) * MB },
    ]),
  );
  const videoResourceTypes = readVideoResourceTypes(env);
  const resourceKinds = Object.fromEntries(
    KNOWN_RESOURCE_TYPES.map((resourceType) => [
      resourceType,
      videoResourceTypes.includes(resourceType) ? [...DEFAULT_FILE_KINDS, 'VIDEO'] : [...DEFAULT_FILE_KINDS],
    ]),
  );
  return { kinds, resourceKinds };
};

// MIME 형식이 속한 묶음 이름. 없으면 null.
export const kindOfMime = (mimeType) =>
  FILE_KIND_NAMES.find((name) => FILE_KINDS[name].mimeTypes.includes(mimeType)) ?? null;

// 그 곳이 받는 묶음. resourceType이 없거나 표에 없으면 기본(IMAGE·PDF).
export const kindsForResource = (rules, resourceType) => rules.resourceKinds[resourceType] ?? [...DEFAULT_FILE_KINDS];

export const isKindAllowedFor = (rules, resourceType, kind) => kindsForResource(rules, resourceType).includes(kind);

// 그 MIME 형식 묶음의 규칙(크기·유효 시간). 표에 없는 형식(예전에 받은 행 등)은 사진·PDF 값으로 본다.
export const kindRulesForMime = (rules, mimeType) => rules.kinds[kindOfMime(mimeType) ?? 'PDF'];

// 붙일 곳이 그 형식을 받는지. 아니면 422 FILE_TYPE_NOT_ALLOWED(권한·존재 확인 뒤에 부른다).
export const assertKindAllowedFor = (rules, resourceType, mimeTypes) => {
  for (const mimeType of mimeTypes) {
    const kind = kindOfMime(mimeType);
    if (kind && isKindAllowedFor(rules, resourceType, kind)) continue;
    throw new AppError('FILE_TYPE_NOT_ALLOWED', 422, kind ? describeKindNotAllowedHere(kind) : describeAllowedKinds(rules, kindsForResource(rules, resourceType)));
  }
};

// 어느 묶음이든 받을 수 있는 가장 큰 크기(로컬 업로드 본문 한도)
export const getMaxUploadBytes = (rules) => Math.max(...Object.values(rules.kinds).map((kind) => kind.maxBytes));

const KIND_SUBJECT = { IMAGE: '사진', PDF: 'PDF', VIDEO: '동영상' };
const toMb = (bytes) => Math.round(bytes / MB);

// 화면·에러 문구. 받는 묶음 목록으로 "JPEG·PNG·WEBP·HEIC 사진과 PDF만 올릴 수 있습니다." 같은 문장을 만든다.
export const describeAllowedKinds = (rules, kindNames) => {
  const labels = kindNames.map((name) => rules.kinds[name].label);
  if (labels.length === 1) return `${labels[0]}만 올릴 수 있습니다.`;
  if (labels.length === 2) return `${labels[0]}과 ${labels[1]}만 올릴 수 있습니다.`;
  return `${labels.slice(0, -1).join(', ')}, ${labels.at(-1)}만 올릴 수 있습니다.`;
};

// 사진·PDF는 기존 문구("파일은 20MB까지…")를 그대로 쓰고, 동영상은 따로 말한다.
export const describeSizeLimit = (rules, kind) =>
  kind === 'VIDEO'
    ? `${KIND_SUBJECT.VIDEO}은 ${toMb(rules.kinds.VIDEO.maxBytes)}MB까지 올릴 수 있습니다.`
    : `파일은 ${toMb(rules.kinds[kind].maxBytes)}MB까지 올릴 수 있습니다.`;

export const describeKindNotAllowedHere = (kind) => `이 곳에는 ${KIND_SUBJECT[kind]}을 올릴 수 없습니다.`;

// 화면용 규칙(GET /files/upload-rules). label·검사 함수는 빼고 값만.
export const toUploadRulesResponse = (rules) => ({
  kinds: Object.fromEntries(
    Object.entries(rules.kinds).map(([name, kind]) => [name, { mimeTypes: kind.mimeTypes, extensions: kind.extensions, maxBytes: kind.maxBytes }]),
  ),
  resourceKinds: rules.resourceKinds,
  uploadSessionTtlMs: Object.fromEntries(Object.entries(rules.kinds).map(([name, kind]) => [name, kind.uploadSessionTtlMs])),
  viewUrlTtlMs: Object.fromEntries(Object.entries(rules.kinds).map(([name, kind]) => [name, kind.viewUrlTtlMs])),
});

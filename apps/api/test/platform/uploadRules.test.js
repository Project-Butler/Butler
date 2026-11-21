// 업로드 규칙 표·환경 변수·파일 앞부분 검사 단위 테스트(DB 없음).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeAllowedKinds,
  describeKindNotAllowedHere,
  describeSizeLimit,
  getMaxUploadBytes,
  getUploadRules,
  isKindAllowedFor,
  kindOfMime,
  kindsForResource,
  matchesDeclaredType,
  toUploadRulesResponse,
} from '../../src/platform/uploadRules.js';

const MB = 1024 * 1024;
const ftyp = (brand) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`), Buffer.from([0, 0, 0, 0])]);

// 잘못된 값 경고(console.warn)를 테스트 출력에 남기지 않는다.
const silenceWarn = (fn) => {
  const original = console.warn;
  const messages = [];
  console.warn = (message) => messages.push(message);
  try {
    return { result: fn(), messages };
  } finally {
    console.warn = original;
  }
};

test('기본값: 사진·PDF 20MB, 동영상 50MB, 동영상은 OWNERSHIP·CONTRACT·TICKET만', () => {
  const rules = getUploadRules({});
  assert.equal(rules.kinds.IMAGE.maxBytes, 20 * MB);
  assert.equal(rules.kinds.PDF.maxBytes, 20 * MB);
  assert.equal(rules.kinds.VIDEO.maxBytes, 50 * MB);
  for (const resourceType of ['OWNERSHIP', 'CONTRACT', 'TICKET']) {
    assert.deepEqual(kindsForResource(rules, resourceType), ['IMAGE', 'PDF', 'VIDEO']);
  }
  for (const resourceType of ['MANAGEMENT_LOG', 'THREAD_MESSAGE', 'RENEWAL_NOTICE', 'PROPERTY', 'UNKNOWN', undefined]) {
    assert.deepEqual(kindsForResource(rules, resourceType), ['IMAGE', 'PDF']);
  }
  assert.equal(isKindAllowedFor(rules, 'TICKET', 'VIDEO'), true);
  assert.equal(isKindAllowedFor(rules, 'MANAGEMENT_LOG', 'VIDEO'), false);
  assert.equal(getMaxUploadBytes(rules), 50 * MB);
});

test('유효 시간: 동영상 업로드 30분·재생 주소 60분·미연결 6시간, 사진·PDF는 15분·5분·24시간', () => {
  const { kinds } = getUploadRules({});
  assert.equal(kinds.IMAGE.uploadSessionTtlMs, 15 * 60 * 1000);
  assert.equal(kinds.IMAGE.viewUrlTtlMs, 5 * 60 * 1000);
  assert.equal(kinds.IMAGE.unattachedTtlMs, 24 * 60 * 60 * 1000);
  assert.equal(kinds.VIDEO.uploadSessionTtlMs, 30 * 60 * 1000);
  assert.equal(kinds.VIDEO.viewUrlTtlMs, 60 * 60 * 1000);
  assert.equal(kinds.VIDEO.unattachedTtlMs, 6 * 60 * 60 * 1000);
});

test('환경 변수로 크기·동영상 위치를 바꾼다(요청마다 읽음)', () => {
  const rules = getUploadRules({ UPLOAD_MAX_DOCUMENT_MB: '10', UPLOAD_MAX_VIDEO_MB: '200', UPLOAD_VIDEO_RESOURCE_TYPES: 'TICKET, MANAGEMENT_LOG' });
  assert.equal(rules.kinds.IMAGE.maxBytes, 10 * MB);
  assert.equal(rules.kinds.PDF.maxBytes, 10 * MB);
  assert.equal(rules.kinds.VIDEO.maxBytes, 200 * MB);
  assert.equal(isKindAllowedFor(rules, 'TICKET', 'VIDEO'), true);
  assert.equal(isKindAllowedFor(rules, 'MANAGEMENT_LOG', 'VIDEO'), true);
  assert.equal(isKindAllowedFor(rules, 'CONTRACT', 'VIDEO'), false);
  // 빈 문자열은 기본값
  assert.equal(getUploadRules({ UPLOAD_MAX_VIDEO_MB: '' }).kinds.VIDEO.maxBytes, 50 * MB);
});

test('UPLOAD_VIDEO_RESOURCE_TYPES: none이면 동영상을 어디에도 받지 않고, 빈 값은 기본값', () => {
  for (const value of ['none', 'NONE', ' none ']) {
    const rules = getUploadRules({ UPLOAD_VIDEO_RESOURCE_TYPES: value });
    for (const resourceType of ['OWNERSHIP', 'CONTRACT', 'TICKET']) assert.equal(isKindAllowedFor(rules, resourceType, 'VIDEO'), false);
  }
  // .env.example을 그대로 복사한 빈 값은 기본값(동영상 켜짐)
  for (const value of ['', '  ']) assert.equal(isKindAllowedFor(getUploadRules({ UPLOAD_VIDEO_RESOURCE_TYPES: value }), 'TICKET', 'VIDEO'), true);
});

test('잘못된 값(정수 아님·0·상한 초과)은 기본값으로 두고 경고한다, 모르는 위치는 뺀다', () => {
  for (const value of ['abc', '0', '-5', '1.5', '5121']) {
    const { result, messages } = silenceWarn(() => getUploadRules({ UPLOAD_MAX_VIDEO_MB: value }));
    assert.equal(result.kinds.VIDEO.maxBytes, 50 * MB, value);
    assert.ok(messages.length <= 1);
  }
  assert.equal(getUploadRules({ UPLOAD_MAX_VIDEO_MB: '5120' }).kinds.VIDEO.maxBytes, 5120 * MB);
  const { result } = silenceWarn(() => getUploadRules({ UPLOAD_VIDEO_RESOURCE_TYPES: 'TICKET,NOPE' }));
  assert.deepEqual(kindsForResource(result, 'TICKET'), ['IMAGE', 'PDF', 'VIDEO']);
  assert.deepEqual(result.resourceKinds.NOPE, undefined);
});

test('MIME 형식 → 묶음', () => {
  assert.equal(kindOfMime('image/jpeg'), 'IMAGE');
  assert.equal(kindOfMime('image/heic'), 'IMAGE');
  assert.equal(kindOfMime('application/pdf'), 'PDF');
  assert.equal(kindOfMime('video/mp4'), 'VIDEO');
  assert.equal(kindOfMime('video/quicktime'), 'VIDEO');
  assert.equal(kindOfMime('video/webm'), null);
  assert.equal(kindOfMime('text/plain'), null);
});

test('동영상 파일 앞부분: MP4·MOV brand는 받고 M4A·HEIF·3GP·가짜 파일은 거절', () => {
  for (const brand of ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'qt  ']) {
    assert.equal(matchesDeclaredType(ftyp(brand), 'video/mp4'), true, brand);
    assert.equal(matchesDeclaredType(ftyp(brand), 'video/quicktime'), true, brand);
    // 동영상 brand는 HEIC로 선언해도 통과하지 않는다(서로 겹치지 않음)
    assert.equal(matchesDeclaredType(ftyp(brand), 'image/heic'), false, brand);
  }
  for (const brand of ['M4A ', 'mif1', 'heic', '3gp4', '3gp5', '3g2a']) {
    assert.equal(matchesDeclaredType(ftyp(brand), 'video/mp4'), false, brand);
    assert.equal(matchesDeclaredType(ftyp(brand), 'video/quicktime'), false, brand);
  }
  // HEIC 사진은 그대로 사진으로 통과
  assert.equal(matchesDeclaredType(ftyp('heic'), 'image/heic'), true);
  assert.equal(matchesDeclaredType(ftyp('mif1'), 'image/heif'), true);
  // ftyp가 없는 파일·짧은 파일
  assert.equal(matchesDeclaredType(Buffer.from('not a video at all'), 'video/mp4'), false);
  assert.equal(matchesDeclaredType(Buffer.from([0, 0, 0]), 'video/mp4'), false);
  assert.equal(matchesDeclaredType(Buffer.from('%PDF-1.7'), 'video/mp4'), false);
});

test('문구: 받는 묶음·크기를 표에서 만든다(사진·PDF는 기존 문구 그대로)', () => {
  const rules = getUploadRules({});
  assert.equal(describeAllowedKinds(rules, ['IMAGE', 'PDF']), 'JPEG·PNG·WEBP·HEIC 사진과 PDF만 올릴 수 있습니다.');
  assert.equal(describeAllowedKinds(rules, ['IMAGE', 'PDF', 'VIDEO']), 'JPEG·PNG·WEBP·HEIC 사진, PDF, MP4·MOV 동영상만 올릴 수 있습니다.');
  assert.equal(describeSizeLimit(rules, 'IMAGE'), '파일은 20MB까지 올릴 수 있습니다.');
  assert.equal(describeSizeLimit(rules, 'VIDEO'), '동영상은 50MB까지 올릴 수 있습니다.');
  assert.equal(describeSizeLimit(getUploadRules({ UPLOAD_MAX_VIDEO_MB: '100' }), 'VIDEO'), '동영상은 100MB까지 올릴 수 있습니다.');
  assert.equal(describeKindNotAllowedHere('VIDEO'), '이 곳에는 동영상을 올릴 수 없습니다.');
});

test('화면용 응답: 묶음별 형식·확장자·크기, 위치별 묶음, 유효 시간', () => {
  const response = toUploadRulesResponse(getUploadRules({}));
  assert.deepEqual(Object.keys(response).sort(), ['kinds', 'resourceKinds', 'uploadSessionTtlMs', 'viewUrlTtlMs']);
  assert.deepEqual(response.kinds.VIDEO, { mimeTypes: ['video/mp4', 'video/quicktime'], extensions: ['mp4', 'mov', 'm4v'], maxBytes: 50 * MB });
  assert.deepEqual(response.resourceKinds.TICKET, ['IMAGE', 'PDF', 'VIDEO']);
  assert.deepEqual(response.resourceKinds.MANAGEMENT_LOG, ['IMAGE', 'PDF']);
  assert.equal(response.uploadSessionTtlMs.VIDEO, 30 * 60 * 1000);
  assert.equal(response.viewUrlTtlMs.PDF, 5 * 60 * 1000);
});

// 저장소 선택·서명·임시 로컬 저장소·형식 검사 단위 테스트. DB를 쓰지 않는다(임시 폴더에 실제 파일).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { matchesDeclaredType, toStoragePath } from '../../../src/domains/documents/fileRules.js';
import { resolveStorageKind, selectStorage } from '../../../src/domains/documents/storage/index.js';
import { createLocalStorage } from '../../../src/domains/documents/storage/local.js';
import { createStorageToken, verifyStorageToken } from '../../../src/domains/documents/storage/signature.js';

const SECRET = 'test-secret';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.from([0, 0, 0, 0])]);
const PDF = Buffer.from('%PDF-1.7\n%');

const tempDirs = [];
const makeTempDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'butler-storage-'));
  tempDirs.push(dir);
  return dir;
};
after(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

test('저장소 선택: local은 Vercel·비밀값 없음이면, supabase는 주소·키가 없으면 쓸 수 없다', () => {
  assert.equal(resolveStorageKind({}), null);
  assert.equal(resolveStorageKind({ STORAGE_DRIVER: 's3' }), null);
  assert.equal(resolveStorageKind({ STORAGE_DRIVER: 'supabase', STORAGE_SIGNING_SECRET: 'x' }), null);
  assert.equal(resolveStorageKind({ STORAGE_DRIVER: 'supabase', SUPABASE_URL: 'https://p.supabase.co' }), null);
  assert.equal(resolveStorageKind({ STORAGE_DRIVER: 'supabase', SUPABASE_SERVICE_ROLE_KEY: 'k' }), null);
  const supabaseEnv = { STORAGE_DRIVER: 'supabase', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', VERCEL: '1' };
  assert.equal(resolveStorageKind(supabaseEnv), 'supabase');
  const supabase = selectStorage(supabaseEnv);
  assert.equal(supabase.kind, 'supabase');
  assert.equal(supabase.servesContent, false);
  assert.equal(resolveStorageKind({ STORAGE_DRIVER: 'local' }), null);
  assert.equal(resolveStorageKind({ STORAGE_DRIVER: 'local', STORAGE_SIGNING_SECRET: 'x' }), 'local');
  assert.equal(resolveStorageKind({ STORAGE_DRIVER: 'local', STORAGE_SIGNING_SECRET: 'x', VERCEL: '1' }), null);
  assert.equal(selectStorage({ STORAGE_DRIVER: 'local', STORAGE_SIGNING_SECRET: 'x', VERCEL: '1' }), null);
  assert.equal(selectStorage({ STORAGE_DRIVER: 'local', STORAGE_SIGNING_SECRET: 'x' }).kind, 'local');
});

test('형식 검사는 확장자가 아니라 파일 앞부분으로 한다', () => {
  assert.ok(matchesDeclaredType(JPEG, 'image/jpeg'));
  assert.ok(matchesDeclaredType(PNG, 'image/png'));
  assert.ok(matchesDeclaredType(WEBP, 'image/webp'));
  assert.ok(matchesDeclaredType(HEIC, 'image/heic'));
  assert.ok(matchesDeclaredType(HEIC, 'image/heif'));
  assert.ok(matchesDeclaredType(PDF, 'application/pdf'));
  // 선언과 내용이 다르면 거절
  assert.equal(matchesDeclaredType(PNG, 'image/jpeg'), false);
  assert.equal(matchesDeclaredType(PDF, 'image/png'), false);
  assert.equal(matchesDeclaredType(Buffer.from('<html>'), 'application/pdf'), false);
  assert.equal(matchesDeclaredType(JPEG, 'image/gif'), false);
  assert.equal(matchesDeclaredType(Buffer.alloc(0), 'image/jpeg'), false);
});

test('서명 토큰: 위조·다른 용도·다른 id·만료를 거절한다', () => {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 60_000);
  const token = createStorageToken({ secret: SECRET, purpose: 'upload', id, expiresAt });
  const verify = (overrides) => verifyStorageToken({ secret: SECRET, purpose: 'upload', id, token, nowMs: Date.now(), ...overrides });

  assert.equal(verify(), 'ok');
  assert.equal(verify({ secret: 'other' }), 'invalid');
  assert.equal(verify({ secret: '' }), 'invalid');
  assert.equal(verify({ purpose: 'download' }), 'invalid');
  assert.equal(verify({ id: randomUUID() }), 'invalid');
  assert.equal(verify({ token: `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}` }), 'invalid');
  // 만료 시각을 늘려도 서명이 맞지 않는다
  const [, signature] = token.split('.');
  assert.equal(verify({ token: `${Math.floor(expiresAt.getTime() / 1000) + 3600}.${signature}` }), 'invalid');
  assert.equal(verify({ token: undefined }), 'invalid');
  assert.equal(verify({ nowMs: expiresAt.getTime() + 2000 }), 'expired');
});

test('local: 업로드 주소·쓰기·확인·다운로드 주소·삭제', async () => {
  const dir = await makeTempDir();
  const storage = createLocalStorage({ dir, secret: SECRET });
  const uploadId = randomUUID();
  const storagePath = toStoragePath(uploadId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60_000);

  const target = storage.createUploadTarget({ uploadId, mimeType: 'image/jpeg', expiresAt });
  assert.equal(target.method, 'PUT');
  assert.deepEqual(target.headers, { 'Content-Type': 'image/jpeg' });
  const token = new URL(target.uploadUrl, 'http://x').searchParams.get('token');
  assert.ok(target.uploadUrl.startsWith(`/api/v1/files/upload-sessions/${uploadId}/content?token=`));
  assert.equal(storage.verifyUploadToken({ uploadId, token, now }), 'ok');

  assert.equal(await storage.confirmObject({ storagePath, sizeBytes: JPEG.length, mimeType: 'image/jpeg' }), false);
  await storage.writeObject(storagePath, JPEG);
  // 원본 파일 이름이 아니라 업로드 id로 저장한다
  assert.deepEqual(await readdir(path.join(dir, 'uploads')), [uploadId]);
  assert.equal(await storage.confirmObject({ storagePath, sizeBytes: JPEG.length, mimeType: 'image/jpeg' }), true);
  assert.equal(await storage.confirmObject({ storagePath, sizeBytes: JPEG.length + 1, mimeType: 'image/jpeg' }), false);
  assert.equal(await storage.confirmObject({ storagePath, sizeBytes: JPEG.length, mimeType: 'image/png' }), false);

  const documentId = randomUUID();
  const downloadUrl = storage.createDownloadUrl({ documentId, expiresAt });
  const downloadToken = new URL(downloadUrl, 'http://x').searchParams.get('token');
  assert.equal(storage.verifyDownloadToken({ documentId, token: downloadToken, now }), 'ok');
  // 업로드 토큰으로는 다운로드할 수 없다
  assert.equal(storage.verifyDownloadToken({ documentId: uploadId, token, now }), 'invalid');

  await storage.deleteObject(storagePath);
  await storage.deleteObject(storagePath);
  assert.equal(await storage.confirmObject({ storagePath, sizeBytes: JPEG.length, mimeType: 'image/jpeg' }), false);
});

test('local: 같은 경로에 동시에 써도 임시 파일이 겹치지 않고 남지 않는다', async () => {
  const dir = await makeTempDir();
  const storage = createLocalStorage({ dir, secret: SECRET });
  const uploadId = randomUUID();
  const storagePath = toStoragePath(uploadId);
  await Promise.all([storage.writeObject(storagePath, JPEG), storage.writeObject(storagePath, JPEG)]);
  assert.deepEqual(await readdir(path.join(dir, 'uploads')), [uploadId]);
  assert.equal(await storage.confirmObject({ storagePath, sizeBytes: JPEG.length, mimeType: 'image/jpeg' }), true);
});

test('local: 업로드 id 모양이 아닌 경로는 거절한다', async () => {
  const storage = createLocalStorage({ dir: await makeTempDir(), secret: SECRET });
  await assert.rejects(storage.writeObject('../escape', JPEG));
  await assert.rejects(storage.deleteObject('uploads/../../x'));
});

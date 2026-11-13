// 파일·문서 API(실제 로컬 Postgres + 임시 폴더의 실제 파일). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 실제 app을 띄워 HTTP로 부른다(업로드 원문 경로는 express.json·csrfGuard 앞에 있어서 경로 순서까지 확인한다).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { MAX_FILE_BYTES } from '../../../src/domains/documents/fileRules.js';
import { cleanupExpiredUploads } from '../../../src/domains/documents/service.js';
import { createStorageToken } from '../../../src/domains/documents/storage/signature.js';
import { createManagementLog } from '../../../src/domains/managementLogs/service.js';
import { softDeleteDocumentsInTx } from '../../../src/platform/documentAttachments.js';
import { getTodayKST } from '../../../src/platform/dateUtils.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const SECRET = 'test-secret';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF test image body')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png body....')]);
const PDF = Buffer.from('%PDF-1.7\n테스트 계약서');
const FUTURE_EXPIRY = new Date(Date.now() + 86400000 * 365);
const STORAGE_KEYS = ['STORAGE_DRIVER', 'STORAGE_SIGNING_SECRET', 'LOCAL_STORAGE_DIR', 'VERCEL'];
// 서명 경로는 IP 기준 한도라 테스트 앞뒤로 카운터를 비운다.
const clearStorageContentLimits = () => prisma.rateLimit.deleteMany({ where: { id: { startsWith: 'storage-content:' } } });

describe('파일·문서 API', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const saved = {};
  let server;
  let origin;
  let storageDir;

  before(async () => {
    for (const key of STORAGE_KEYS) saved[key] = process.env[key];
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'butler-documents-'));
    Object.assign(process.env, { STORAGE_DRIVER: 'local', STORAGE_SIGNING_SECRET: SECRET, LOCAL_STORAGE_DIR: storageDir });
    delete process.env.VERCEL;
    await clearStorageContentLimits();
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    for (const key of STORAGE_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await new Promise((resolve) => server.close(resolve));
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.document.deleteMany({ where: { uploaderId: { in: userIds } } });
    await prisma.upload.deleteMany({ where: { userId: { in: userIds } } });
    for (const id of userIds) await prisma.rateLimit.deleteMany({ where: { id: { contains: id } } });
    await clearStorageContentLimits();
    await fixture.cleanup();
    await rm(storageDir, { recursive: true, force: true });
  });

  const landlord = async () => {
    const user = await fixture.createUser('LANDLORD');
    userIds.push(user.id);
    return user;
  };
  let unitSeq = 0;
  const createProperty = async () => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '102', unitNo: `${3000 + unitSeq}` } });
  };
  const own = (user, property, data = {}) => prisma.ownership.create({ data: { propertyId: property.id, userId: user.id, ...data } });
  const verified = { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE_EXPIRY };
  const writeLog = (user, property, scope = 'PRIVATE') =>
    createManagementLog(user, property.id, { scope, type: 'REPAIR', title: '사진 기록', occurredOn: getTodayKST() });

  const api = (user, pathname, init = {}) =>
    fetch(`${origin}/api/v1${pathname}`, {
      ...init,
      headers: {
        ...(user ? { Cookie: `access_token=${signAccessToken(user)}` } : {}),
        'X-Requested-With': 'butler-web',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  const json = async (response) => ({ status: response.status, body: response.status === 204 ? null : await response.json() });
  const postJson = async (user, pathname, body) => json(await api(user, pathname, { method: 'POST', body: JSON.stringify(body) }));

  const createSession = (user, overrides = {}) =>
    postJson(user, '/files/upload-sessions', { fileName: '욕실 사진.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG.length, documentType: 'PHOTO', ...overrides });
  // 브라우저처럼 쿠키·CSRF 헤더 없이 서명 주소로만 올린다.
  const putContent = (uploadUrl, content, contentType = 'image/jpeg') =>
    fetch(`${origin}${uploadUrl}`, { method: 'PUT', headers: { 'Content-Type': contentType }, body: content });
  const uploadDocument = async (user, { content = JPEG, mimeType = 'image/jpeg', documentType = 'PHOTO', resource = {} } = {}) => {
    const session = await createSession(user, { mimeType, sizeBytes: content.length, documentType });
    assert.equal(session.status, 201);
    assert.equal((await putContent(session.body.data.uploadUrl, content, mimeType)).status, 204);
    const registered = await postJson(user, '/documents', { uploadSessionId: session.body.data.id, ...resource });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    return registered.body.data;
  };
  const storedFiles = async () => {
    try {
      return await readdir(path.join(storageDir, 'uploads'));
    } catch {
      return [];
    }
  };

  test('업로드 → 등록(관리 로그) → 목록·상세 → 다운로드 → 삭제', async () => {
    const user = await landlord();
    const property = await createProperty();
    await own(user, property);
    const log = await writeLog(user, property);

    const session = await createSession(user);
    assert.equal(session.status, 201);
    const { id: uploadId, uploadUrl, method, headers, expiresAt } = session.body.data;
    assert.equal(method, 'PUT');
    assert.deepEqual(headers, { 'Content-Type': 'image/jpeg' });
    assert.ok(uploadUrl.startsWith(`/api/v1/files/upload-sessions/${uploadId}/content?token=`));
    const ttlMinutes = (Date.parse(expiresAt) - Date.now()) / 60000;
    assert.ok(ttlMinutes > 14 && ttlMinutes <= 15);

    // 올리기 전 등록 → 422
    const early = await postJson(user, '/documents', { uploadSessionId: uploadId });
    assert.equal(early.body.error.code, 'UPLOAD_NOT_COMPLETED');

    assert.equal((await putContent(uploadUrl, JPEG)).status, 204);
    // 원본 파일 이름이 아니라 업로드 id로 저장한다
    assert.ok((await storedFiles()).includes(uploadId));

    const registered = await postJson(user, '/documents', { uploadSessionId: uploadId, resourceType: 'MANAGEMENT_LOG', resourceId: log.id });
    assert.equal(registered.status, 201);
    const document = registered.body.data;
    assert.equal(document.fileName, '욕실 사진.jpg');
    assert.equal(document.mimeType, 'image/jpeg');
    assert.equal(document.sizeBytes, JPEG.length);
    assert.equal(document.documentType, 'PHOTO');
    assert.equal(document.resourceType, 'MANAGEMENT_LOG');
    assert.equal(document.resourceId, log.id);
    assert.equal(document.isLocked, false);

    // 같은 업로드로 두 번 등록할 수 없다
    assert.equal((await postJson(user, '/documents', { uploadSessionId: uploadId })).body.error.code, 'UPLOAD_SESSION_NOT_FOUND');
    // 등록한 업로드에 다시 쓸 수 없다
    assert.equal((await putContent(uploadUrl, JPEG)).status, 404);

    const list = await json(await api(user, `/documents?resourceType=MANAGEMENT_LOG&resourceId=${log.id}`));
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((item) => item.id), [document.id]);
    assert.deepEqual(list.body.meta, { page: 1, size: 20, total: 1, hasNext: false });
    assert.equal((await json(await api(user, `/documents/${document.id}`))).body.data.id, document.id);

    const download = await postJson(user, `/documents/${document.id}/download-url`, {});
    assert.equal(download.status, 200);
    const downloadTtl = (Date.parse(download.body.data.expiresAt) - Date.now()) / 60000;
    assert.ok(downloadTtl > 4 && downloadTtl <= 5);
    // 사진은 감사 로그를 남기지 않는다
    assert.equal(await prisma.auditLog.count({ where: { action: 'DOCUMENT_DOWNLOAD_URL_ISSUED', resourceId: document.id } }), 0);
    const content = await fetch(`${origin}${download.body.data.url}`);
    assert.equal(content.status, 200);
    assert.equal(content.headers.get('content-type'), 'image/jpeg');
    assert.equal(content.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(content.headers.get('content-security-policy'), "sandbox; default-src 'none'");
    assert.ok(content.headers.get('content-disposition').includes(encodeURIComponent('욕실 사진.jpg')));
    assert.deepEqual(Buffer.from(await content.arrayBuffer()), JPEG);

    const removed = await api(user, `/documents/${document.id}`, { method: 'DELETE' });
    assert.equal(removed.status, 204);
    const row = await prisma.document.findUnique({ where: { id: document.id } });
    assert.ok(row.deletedAt);
    assert.equal((await storedFiles()).includes(uploadId), false);
    assert.equal(await prisma.auditLog.count({ where: { action: 'DOCUMENT_DELETED', resourceId: document.id } }), 1);
    assert.equal((await api(user, `/documents/${document.id}`)).status, 404);
    // 지운 문서의 다운로드 주소는 더 쓸 수 없다
    assert.equal((await fetch(`${origin}${download.body.data.url}`)).status, 404);
  });

  test('계약서 PDF 다운로드 URL 발급은 감사 로그에 남는다, 미연결 문서는 올린 사람만 본다', async () => {
    const user = await landlord();
    const other = await landlord();
    const document = await uploadDocument(user, { content: PDF, mimeType: 'application/pdf', documentType: 'CONTRACT_DOCUMENT' });
    assert.equal(document.resourceType, null);
    assert.equal((await postJson(user, `/documents/${document.id}/download-url`, {})).status, 200);
    assert.equal(await prisma.auditLog.count({ where: { action: 'DOCUMENT_DOWNLOAD_URL_ISSUED', resourceId: document.id, actorId: user.id } }), 1);
    assert.equal((await api(other, `/documents/${document.id}`)).status, 404);
    assert.equal((await postJson(other, `/documents/${document.id}/download-url`, {})).status, 404);
    assert.equal((await api(other, `/documents/${document.id}`, { method: 'DELETE' })).status, 404);
  });

  test('형식·크기: 허용 밖 형식, 20MB 초과, 선언과 다른 내용, 크기 불일치', async () => {
    const user = await landlord();
    assert.equal((await createSession(user, { mimeType: 'image/gif' })).body.error.code, 'FILE_TYPE_NOT_ALLOWED');
    assert.equal((await createSession(user, { mimeType: 'text/html' })).body.error.code, 'FILE_TYPE_NOT_ALLOWED');
    const tooLarge = await createSession(user, { sizeBytes: MAX_FILE_BYTES + 1 });
    assert.equal(tooLarge.status, 422);
    assert.equal(tooLarge.body.error.code, 'FILE_TOO_LARGE');
    assert.equal((await createSession(user, { documentType: 'SELFIE' })).status, 400);
    assert.equal((await createSession(user, { sizeBytes: 0 })).status, 400);

    // jpg라고 하고 PNG 내용을 올리면 거절(확장자·Content-Type이 아니라 앞부분으로 본다)
    const mismatch = await createSession(user, { sizeBytes: PNG.length });
    const put = await putContent(mismatch.body.data.uploadUrl, PNG, 'image/jpeg');
    assert.equal(put.status, 422);
    assert.equal((await put.json()).error.code, 'FILE_TYPE_NOT_ALLOWED');
    assert.equal((await storedFiles()).includes(mismatch.body.data.id), false);

    const wrongSize = await createSession(user, { sizeBytes: JPEG.length + 5 });
    assert.equal((await putContent(wrongSize.body.data.uploadUrl, JPEG)).status, 400);

    // 서명이 맞아도 본문이 20MB를 넘으면 400이 아니라 422 FILE_TOO_LARGE
    const oversized = await createSession(user);
    const huge = Buffer.concat([JPEG, Buffer.alloc(MAX_FILE_BYTES + 1 - JPEG.length)]);
    const hugePut = await putContent(oversized.body.data.uploadUrl, huge);
    assert.equal(hugePut.status, 422);
    assert.equal((await hugePut.json()).error.code, 'FILE_TOO_LARGE');
    assert.equal((await storedFiles()).includes(oversized.body.data.id), false);
  });

  test('파일 이름: 깨진 유니코드·제어 문자는 400, 다운로드 헤더는 RFC 5987로 인코딩', async () => {
    const user = await landlord();
    for (const fileName of ['깨진\uD800이름.jpg', '줄\n바꿈.jpg', 'tab\t.jpg', 'del\u007f.jpg']) {
      const rejected = await createSession(user, { fileName });
      assert.equal(rejected.status, 400, JSON.stringify(fileName));
      assert.equal(rejected.body.error.details[0].field, 'fileName');
    }

    const session = await createSession(user, { fileName: "it's (1)*.jpg" });
    assert.equal(session.status, 201);
    await putContent(session.body.data.uploadUrl, JPEG);
    const document = (await postJson(user, '/documents', { uploadSessionId: session.body.data.id })).body.data;
    const { url } = (await postJson(user, `/documents/${document.id}/download-url`, {})).body.data;
    const content = await fetch(`${origin}${url}`);
    assert.equal(content.headers.get('content-disposition'), "inline; filename*=UTF-8''it%27s%20%281%29%2A.jpg");
    await content.arrayBuffer();
  });

  test('서명: 위조·만료 토큰, 만료된 세션 등록, 다운로드 주소 위조', async () => {
    const user = await landlord();
    const session = await createSession(user);
    const { id, uploadUrl } = session.body.data;
    const token = new URL(uploadUrl, origin).searchParams.get('token');
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    const forged = await putContent(`/api/v1/files/upload-sessions/${id}/content?token=${tampered}`, JPEG);
    assert.equal(forged.status, 403);
    assert.equal((await forged.json()).error.code, 'STORAGE_SIGNATURE_INVALID');
    assert.equal((await putContent(`/api/v1/files/upload-sessions/${id}/content`, JPEG)).status, 403);
    assert.equal((await putContent(`/api/v1/files/upload-sessions/not-a-uuid/content?token=${token}`, JPEG)).status, 404);
    // 다른 세션의 토큰으로는 못 올린다
    const otherSession = await createSession(user);
    assert.equal((await putContent(`/api/v1/files/upload-sessions/${otherSession.body.data.id}/content?token=${token}`, JPEG)).status, 403);

    const expiredToken = createStorageToken({ secret: SECRET, purpose: 'upload', id, expiresAt: new Date(Date.now() - 1000) });
    const expired = await putContent(`/api/v1/files/upload-sessions/${id}/content?token=${expiredToken}`, JPEG);
    assert.equal(expired.status, 422);
    assert.equal((await expired.json()).error.code, 'UPLOAD_SESSION_EXPIRED');

    // 올린 뒤 세션이 만료되면 등록할 수 없다
    assert.equal((await putContent(uploadUrl, JPEG)).status, 204);
    await prisma.upload.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await postJson(user, '/documents', { uploadSessionId: id })).body.error.code, 'UPLOAD_SESSION_EXPIRED');

    const document = await uploadDocument(user);
    const { url } = (await postJson(user, `/documents/${document.id}/download-url`, {})).body.data;
    const downloadToken = new URL(url, origin).searchParams.get('token');
    assert.equal((await fetch(`${origin}/api/v1/documents/${document.id}/content?token=${downloadToken.slice(0, -2)}00`)).status, 403);
    // 업로드 토큰으로 다운로드할 수 없다
    assert.equal((await fetch(`${origin}/api/v1/documents/${document.id}/content?token=${token}`)).status, 403);
    const expiredDownload = createStorageToken({ secret: SECRET, purpose: 'download', id: document.id, expiresAt: new Date(Date.now() - 1000) });
    assert.equal((await fetch(`${origin}/api/v1/documents/${document.id}/content?token=${expiredDownload}`)).status, 403);
  });

  test('권한: 남의 세션·볼 수 없는 기록은 404, 구현 안 된 resourceType은 400', async () => {
    const owner = await landlord();
    const stranger = await landlord();
    const property = await createProperty();
    await own(owner, property);
    const log = await writeLog(owner, property);
    const document = await uploadDocument(owner, { resource: { resourceType: 'MANAGEMENT_LOG', resourceId: log.id } });

    assert.equal((await api(stranger, `/documents/${document.id}`)).status, 404);
    const strangerList = await json(await api(stranger, `/documents?resourceType=MANAGEMENT_LOG&resourceId=${log.id}`));
    assert.equal(strangerList.body.error.code, 'MANAGEMENT_LOG_NOT_FOUND');

    const ownerSession = await createSession(owner);
    await putContent(ownerSession.body.data.uploadUrl, JPEG);
    assert.equal((await postJson(stranger, '/documents', { uploadSessionId: ownerSession.body.data.id })).body.error.code, 'UPLOAD_SESSION_NOT_FOUND');

    const strangerSession = await createSession(stranger);
    await putContent(strangerSession.body.data.uploadUrl, JPEG);
    const attachToOthers = await postJson(stranger, '/documents', {
      uploadSessionId: strangerSession.body.data.id,
      resourceType: 'MANAGEMENT_LOG',
      resourceId: log.id,
    });
    assert.equal(attachToOthers.status, 404);
    assert.equal(attachToOthers.body.error.code, 'MANAGEMENT_LOG_NOT_FOUND');

    const unsupported = await postJson(stranger, '/documents', {
      uploadSessionId: strangerSession.body.data.id,
      resourceType: 'CONTRACT',
      resourceId: randomUUID(),
    });
    assert.equal(unsupported.status, 400);
    assert.match(unsupported.body.error.details[0].reason, /MANAGEMENT_LOG/);
    assert.equal((await postJson(stranger, '/documents', { uploadSessionId: strangerSession.body.data.id, resourceType: 'MANAGEMENT_LOG' })).status, 400);
    assert.equal((await api(null, '/files/upload-sessions', { method: 'POST', body: '{}' })).status, 401);
  });

  test('Vercel에서는 임시 로컬 저장소를 쓸 수 없다(503), 문서 조회는 된다', async () => {
    const user = await landlord();
    const document = await uploadDocument(user);
    process.env.VERCEL = '1';
    try {
      const unavailable = await createSession(user);
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.body.error.code, 'STORAGE_UNAVAILABLE');
      assert.equal((await postJson(user, `/documents/${document.id}/download-url`, {})).status, 503);
      // 업로드 본문도 읽기 전에 503
      assert.equal((await putContent(`/api/v1/files/upload-sessions/${randomUUID()}/content?token=1.${'0'.repeat(64)}`, JPEG)).status, 503);
      assert.equal((await api(user, `/documents/${document.id}`)).status, 200);
    } finally {
      delete process.env.VERCEL;
    }
  });

  test('정리: 만료된 미등록 세션과 24시간 지난 미연결 문서를 파일과 함께 지운다', async () => {
    const user = await landlord();
    const expiredSession = await createSession(user);
    await putContent(expiredSession.body.data.uploadUrl, JPEG);
    const neverUploaded = await createSession(user);
    const freshSession = await createSession(user);
    // 만료 후 2시간은 남긴다(Supabase 서명 업로드 URL 유효 시간)
    const graceSession = await createSession(user);
    await prisma.upload.update({ where: { id: graceSession.body.data.id }, data: { expiresAt: new Date(Date.now() - 90 * 60_000) } });
    const past = new Date(Date.now() - 3 * 3600_000);
    await prisma.upload.updateMany({ where: { id: { in: [expiredSession.body.data.id, neverUploaded.body.data.id] } }, data: { expiresAt: past } });

    const stale = await uploadDocument(user);
    const fresh = await uploadDocument(user);
    await prisma.document.update({ where: { id: stale.id }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    // 지난 세션이어도 등록된 업로드는 남긴다
    await prisma.upload.updateMany({ where: { document: { id: { in: [stale.id, fresh.id] } } }, data: { expiresAt: past } });
    const staleUpload = await prisma.document.findUnique({ where: { id: stale.id }, select: { uploadId: true } });
    const freshUpload = await prisma.document.findUnique({ where: { id: fresh.id }, select: { uploadId: true } });

    const result = await cleanupExpiredUploads();
    assert.ok(result.uploadsDeleted >= 2);
    assert.ok(result.documentsDeleted >= 1);
    const remaining = await prisma.upload.findMany({ where: { userId: user.id }, select: { id: true } });
    assert.deepEqual(
      remaining.map((row) => row.id).sort(),
      [freshSession.body.data.id, graceSession.body.data.id, staleUpload.uploadId, freshUpload.uploadId].sort(),
    );
    const files = await storedFiles();
    assert.equal(files.includes(expiredSession.body.data.id), false);
    assert.equal(files.includes(staleUpload.uploadId), false);
    assert.ok(files.includes(freshUpload.uploadId));
    assert.ok((await prisma.document.findUnique({ where: { id: stale.id } })).deletedAt);
    assert.equal((await prisma.document.findUnique({ where: { id: fresh.id } })).deletedAt, null);

    // 저장소를 쓸 수 없으면 건너뛴다
    process.env.VERCEL = '1';
    try {
      assert.deepEqual(await cleanupExpiredUploads(), { skipped: 'storage unavailable' });
    } finally {
      delete process.env.VERCEL;
    }
  });

  test('파일이 사라진 문서의 다운로드는 404', async () => {
    const user = await landlord();
    const document = await uploadDocument(user);
    const row = await prisma.document.findUnique({ where: { id: document.id } });
    await rm(path.join(storageDir, ...row.storagePath.split('/')), { force: true });
    const { url } = (await postJson(user, `/documents/${document.id}/download-url`, {})).body.data;
    assert.equal((await fetch(`${origin}${url}`)).status, 404);
    // 같은 경로에 파일을 다시 두면 받을 수 있다
    await mkdir(path.join(storageDir, 'uploads'), { recursive: true });
    await writeFile(path.join(storageDir, ...row.storagePath.split('/')), JPEG);
    assert.equal((await fetch(`${origin}${url}`)).status, 200);
  });

  test('경합: 읽은 뒤 붙거나 잠긴 문서는 숨기지 않는다(404로 되돌림), 같은 업로드 동시 등록은 하나만', async () => {
    const user = await landlord();
    const property = await createProperty();
    await own(user, property);
    const log = await writeLog(user, property);
    const document = await uploadDocument(user);
    const stale = await prisma.document.findUnique({ where: { id: document.id } });
    // 삭제 요청이 읽은 뒤 다른 요청이 관리 로그에 붙였다
    await prisma.document.update({ where: { id: document.id }, data: { resourceType: 'MANAGEMENT_LOG', resourceId: log.id, attachedAt: new Date() } });
    await assert.rejects(
      prisma.$transaction((tx) => softDeleteDocumentsInTx(tx, [stale], new Date())),
      (error) => error.code === 'DOCUMENT_NOT_FOUND' && error.httpStatus === 404,
    );
    assert.equal((await prisma.document.findUnique({ where: { id: document.id } })).deletedAt, null);
    // 읽은 뒤 잠긴 문서도 숨기지 않는다
    const attached = await prisma.document.findUnique({ where: { id: document.id } });
    await prisma.document.update({ where: { id: document.id }, data: { isLocked: true } });
    await assert.rejects(prisma.$transaction((tx) => softDeleteDocumentsInTx(tx, [attached], new Date())));
    assert.equal((await prisma.document.findUnique({ where: { id: document.id } })).deletedAt, null);

    const session = await createSession(user);
    await putContent(session.body.data.uploadUrl, JPEG);
    const results = await Promise.all([0, 1].map(() => postJson(user, '/documents', { uploadSessionId: session.body.data.id })));
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 404]);
    assert.equal(results.find((result) => result.status === 404).body.error.code, 'UPLOAD_SESSION_NOT_FOUND');
  });

  test('서명 경로는 IP 기준 요청 한도(429)', async () => {
    const user = await landlord();
    const document = await uploadDocument(user);
    const { url } = (await postJson(user, `/documents/${document.id}/download-url`, {})).body.data;
    const windowMs = 60_000;
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    const expiresAt = new Date(windowStart.getTime() + windowMs);
    const id = 'storage-content:127.0.0.1';
    await prisma.rateLimit.upsert({ where: { id }, create: { id, count: 120, windowStart, expiresAt }, update: { count: 120, windowStart, expiresAt } });
    try {
      const limited = await fetch(`${origin}${url}`);
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
    } finally {
      await clearStorageContentLimits();
    }
  });
});

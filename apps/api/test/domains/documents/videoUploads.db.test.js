// 동영상 업로드(실제 로컬 Postgres + 임시 폴더의 실제 파일). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 동영상은 문서함(OWNERSHIP·CONTRACT)과 수리 요청(TICKET)에만 붙고, 하우스 로그·메시지·갱신 통지에는 붙지 않는다(platform/uploadRules.js).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { cleanupExpiredUploads } from '../../../src/domains/documents/service.js';
import { createManagementLog } from '../../../src/domains/managementLogs/service.js';
import { createTicket } from '../../../src/domains/tickets/service.js';
import { getTodayKST } from '../../../src/platform/dateUtils.js';
import {
  attachDocumentsInTx,
  MANAGEMENT_LOG_RESOURCE,
  RENEWAL_NOTICE_RESOURCE,
  TICKET_RESOURCE,
} from '../../../src/platform/documentAttachments.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const SECRET = 'test-secret';
const MB = 1024 * 1024;
// ftyp major brand로 형식을 본다. 뒤는 아무 내용(테스트용 가짜 영상 본문).
const video = (brand = 'isom', bodyBytes = 1000) =>
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`), Buffer.from([0, 0, 2, 0]), Buffer.alloc(bodyBytes, 7)]);
const MP4 = video('isom');
const MOV = video('qt  ');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF test image body')]);
const STORAGE_KEYS = ['STORAGE_DRIVER', 'STORAGE_SIGNING_SECRET', 'LOCAL_STORAGE_DIR', 'VERCEL', 'UPLOAD_MAX_VIDEO_MB', 'UPLOAD_VIDEO_RESOURCE_TYPES'];
const TODAY = getTodayKST();
const shift = (days) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};
const clearStorageContentLimits = () => prisma.rateLimit.deleteMany({ where: { id: { startsWith: 'storage-content:' } } });

const rejectsWith = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
};

describe('동영상 업로드', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const saved = {};
  let server;
  let origin;
  let storageDir;

  before(async () => {
    for (const key of STORAGE_KEYS) saved[key] = process.env[key];
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'butler-video-'));
    Object.assign(process.env, { STORAGE_DRIVER: 'local', STORAGE_SIGNING_SECRET: SECRET, LOCAL_STORAGE_DIR: storageDir });
    delete process.env.VERCEL;
    delete process.env.UPLOAD_MAX_VIDEO_MB;
    delete process.env.UPLOAD_VIDEO_RESOURCE_TYPES;
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

  const createUser = async (role) => {
    const user = await fixture.createUser(role);
    userIds.push(user.id);
    return user;
  };
  let unitSeq = 0;
  const createProperty = async () => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '103', unitNo: `${4000 + unitSeq}` } });
  };
  const own = (user, property) => prisma.ownership.create({ data: { propertyId: property.id, userId: user.id } });
  const lease = (ownership, tenant) =>
    prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        tenantId: tenant.id,
        tenantName: '김임차',
        tenantPhone: '01000000000',
        leaseType: 'MONTHLY',
        deposit: 10000000n,
        monthlyRent: 500000n,
        startDate: shift(-30),
        endDate: shift(300),
      },
    });
  // 임대인·임차인·진행 중 계약이 있는 호실
  const setup = async () => {
    const landlord = await createUser('LANDLORD');
    const tenant = await createUser('TENANT');
    const property = await createProperty();
    const ownership = await own(landlord, property);
    const contract = await lease(ownership, tenant);
    return { landlord, tenant, property, ownership, contract };
  };

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
    postJson(user, '/files/upload-sessions', {
      fileName: '입주 영상.mp4',
      mimeType: 'video/mp4',
      sizeBytes: MP4.length,
      documentType: 'MOVE_PHOTO',
      targetResourceType: 'CONTRACT',
      ...overrides,
    });
  const putContent = (uploadUrl, content, contentType) =>
    fetch(`${origin}${uploadUrl}`, { method: 'PUT', headers: { 'Content-Type': contentType }, body: content });
  // 올리고 등록한다. resource를 빼면 미연결 문서.
  const uploadVideo = async (user, { content = MP4, mimeType = 'video/mp4', documentType = 'MOVE_PHOTO', target = 'CONTRACT', resource = {} } = {}) => {
    const session = await createSession(user, { mimeType, sizeBytes: content.length, documentType, targetResourceType: target });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    assert.equal((await putContent(session.body.data.uploadUrl, content, mimeType)).status, 204);
    const registered = await postJson(user, '/documents', { uploadSessionId: session.body.data.id, ...resource });
    return registered;
  };

  test('업로드 규칙 API: 로그인한 사람에게 형식·크기·위치·유효 시간을 준다', async () => {
    const user = await createUser('LANDLORD');
    assert.equal((await api(null, '/files/upload-rules')).status, 401);
    const { status, body } = await json(await api(user, '/files/upload-rules'));
    assert.equal(status, 200);
    assert.deepEqual(body.data.kinds.VIDEO, { mimeTypes: ['video/mp4', 'video/quicktime'], extensions: ['mp4', 'mov', 'm4v'], maxBytes: 50 * MB });
    assert.equal(body.data.kinds.IMAGE.maxBytes, 20 * MB);
    assert.deepEqual(body.data.resourceKinds.TICKET, ['IMAGE', 'PDF', 'VIDEO']);
    assert.deepEqual(body.data.resourceKinds.MANAGEMENT_LOG, ['IMAGE', 'PDF']);
    assert.equal(body.data.uploadSessionTtlMs.VIDEO, 30 * 60 * 1000);
    assert.equal(body.data.viewUrlTtlMs.VIDEO, 60 * 60 * 1000);

    // 환경 변수를 바꾸면 다음 요청부터 바뀐다(요청마다 읽음)
    process.env.UPLOAD_MAX_VIDEO_MB = '100';
    process.env.UPLOAD_VIDEO_RESOURCE_TYPES = 'TICKET';
    try {
      const changed = await json(await api(user, '/files/upload-rules'));
      assert.equal(changed.body.data.kinds.VIDEO.maxBytes, 100 * MB);
      assert.deepEqual(changed.body.data.resourceKinds.CONTRACT, ['IMAGE', 'PDF']);
    } finally {
      delete process.env.UPLOAD_MAX_VIDEO_MB;
      delete process.env.UPLOAD_VIDEO_RESOURCE_TYPES;
    }
  });

  test('세션: 동영상은 붙일 곳이 있어야 하고, 그 곳이 동영상을 받아야 하고, 50MB까지', async () => {
    const user = await createUser('LANDLORD');
    const ok = await createSession(user);
    assert.equal(ok.status, 201);
    // 동영상 업로드 세션은 30분
    const ttlMinutes = (Date.parse(ok.body.data.expiresAt) - Date.now()) / 60000;
    assert.ok(ttlMinutes > 29 && ttlMinutes <= 30, String(ttlMinutes));
    assert.equal((await createSession(user, { sizeBytes: 50 * MB })).status, 201);
    assert.equal((await createSession(user, { mimeType: 'video/quicktime', targetResourceType: 'TICKET', documentType: 'PHOTO' })).status, 201);
    assert.equal((await createSession(user, { targetResourceType: 'OWNERSHIP', documentType: 'OTHER' })).status, 201);

    const tooLarge = await createSession(user, { sizeBytes: 50 * MB + 1 });
    assert.equal(tooLarge.status, 422);
    assert.equal(tooLarge.body.error.code, 'FILE_TOO_LARGE');
    assert.equal(tooLarge.body.error.message, '동영상은 50MB까지 올릴 수 있습니다.');

    const noTarget = await createSession(user, { targetResourceType: undefined });
    assert.equal(noTarget.status, 422);
    assert.equal(noTarget.body.error.code, 'FILE_TYPE_NOT_ALLOWED');
    for (const target of ['MANAGEMENT_LOG', 'RENEWAL_NOTICE', 'PROPERTY']) {
      const rejected = await createSession(user, { targetResourceType: target });
      assert.equal(rejected.status, 422, target);
      assert.equal(rejected.body.error.message, '이 곳에는 동영상을 올릴 수 없습니다.');
    }
    // 대화 메시지는 동영상을 받는다(50MB)
    assert.equal((await createSession(user, { targetResourceType: 'THREAD_MESSAGE' })).status, 201);
    const unknown = await createSession(user, { targetResourceType: 'NOPE' });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.details[0].field, 'targetResourceType');
    // 결정 밖 동영상 형식
    assert.equal((await createSession(user, { mimeType: 'video/webm' })).body.error.code, 'FILE_TYPE_NOT_ALLOWED');
  });

  test('세션: 사진·PDF는 그대로(붙일 곳 없이 20MB, 붙일 곳이 있어도 같은 한도)', async () => {
    const user = await createUser('LANDLORD');
    const photo = { fileName: '욕실.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG.length, documentType: 'PHOTO', targetResourceType: undefined };
    assert.equal((await createSession(user, photo)).status, 201);
    assert.equal((await createSession(user, { ...photo, targetResourceType: 'MANAGEMENT_LOG' })).status, 201);
    const tooLarge = await createSession(user, { ...photo, sizeBytes: 20 * MB + 1, targetResourceType: 'TICKET' });
    assert.equal(tooLarge.body.error.code, 'FILE_TOO_LARGE');
    assert.equal(tooLarge.body.error.message, '파일은 20MB까지 올릴 수 있습니다.');
    // 동영상 위치를 none으로 두면 동영상은 어디에도 못 올린다
    process.env.UPLOAD_VIDEO_RESOURCE_TYPES = 'none';
    try {
      assert.equal((await createSession(user)).body.error.code, 'FILE_TYPE_NOT_ALLOWED');
    } finally {
      delete process.env.UPLOAD_VIDEO_RESOURCE_TYPES;
    }
  });

  test('본문 검사: 동영상 brand가 아니면 거절, MOV를 video/mp4로 선언해도 통과', async () => {
    const user = await createUser('LANDLORD');
    const fake = await createSession(user, { sizeBytes: 20 });
    const fakePut = await putContent(fake.body.data.uploadUrl, Buffer.from('this is not a video!'), 'video/mp4');
    assert.equal(fakePut.status, 422);
    const audio = video('M4A ');
    const audioSession = await createSession(user, { sizeBytes: audio.length });
    assert.equal((await putContent(audioSession.body.data.uploadUrl, audio, 'video/mp4')).status, 422);
    const heic = video('mif1');
    const heicSession = await createSession(user, { sizeBytes: heic.length });
    assert.equal((await putContent(heicSession.body.data.uploadUrl, heic, 'video/mp4')).status, 422);
    const movAsMp4 = await createSession(user, { sizeBytes: MOV.length });
    assert.equal((await putContent(movAsMp4.body.data.uploadUrl, MOV, 'video/mp4')).status, 204);
  });

  test('문서함: 계약 입주·퇴거 사진과 내 소유 문서에 동영상을 올리고, Range로 재생 주소를 읽는다', async () => {
    const { landlord, ownership, contract } = await setup();
    const contractVideo = await uploadVideo(landlord, { resource: { resourceType: 'CONTRACT', resourceId: contract.id } });
    assert.equal(contractVideo.status, 201, JSON.stringify(contractVideo.body));
    assert.equal(contractVideo.body.data.mimeType, 'video/mp4');
    const ownershipVideo = await uploadVideo(landlord, {
      content: MOV,
      mimeType: 'video/quicktime',
      documentType: 'OTHER',
      target: 'OWNERSHIP',
      resource: { resourceType: 'OWNERSHIP', resourceId: ownership.id },
    });
    assert.equal(ownershipVideo.status, 201, JSON.stringify(ownershipVideo.body));

    const url = await postJson(landlord, `/documents/${contractVideo.body.data.id}/download-url`, {});
    assert.equal(url.status, 200);
    // 동영상 재생 주소는 60분
    const ttlMinutes = (Date.parse(url.body.data.expiresAt) - Date.now()) / 60000;
    assert.ok(ttlMinutes > 59 && ttlMinutes <= 60, String(ttlMinutes));

    const full = await fetch(`${origin}${url.body.data.url}`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    assert.equal(full.headers.get('content-length'), String(MP4.length));
    assert.equal(Buffer.from(await full.arrayBuffer()).equals(MP4), true);

    const part = await fetch(`${origin}${url.body.data.url}`, { headers: { Range: 'bytes=4-11' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 4-11/${MP4.length}`);
    assert.equal(part.headers.get('content-length'), '8');
    assert.equal(Buffer.from(await part.arrayBuffer()).toString('latin1'), 'ftypisom');

    const open = await fetch(`${origin}${url.body.data.url}`, { headers: { Range: `bytes=${MP4.length - 10}-` } });
    assert.equal(open.status, 206);
    assert.equal(open.headers.get('content-length'), '10');
    const suffix = await fetch(`${origin}${url.body.data.url}`, { headers: { Range: 'bytes=-5' } });
    assert.equal(suffix.headers.get('content-range'), `bytes ${MP4.length - 5}-${MP4.length - 1}/${MP4.length}`);

    const outside = await fetch(`${origin}${url.body.data.url}`, { headers: { Range: `bytes=${MP4.length}-` } });
    assert.equal(outside.status, 416);
    assert.equal(outside.headers.get('content-range'), `bytes */${MP4.length}`);
    // 모르는 단위·여러 범위는 전체를 준다
    assert.equal((await fetch(`${origin}${url.body.data.url}`, { headers: { Range: 'items=0-1' } })).status, 200);
    assert.equal((await fetch(`${origin}${url.body.data.url}`, { headers: { Range: 'bytes=0-1,5-6' } })).status, 200);
  });

  test('붙이기: 동영상은 하우스 로그에 붙일 수 없다(POST /documents), 남의 동영상은 404가 먼저', async () => {
    const { landlord, property } = await setup();
    const log = await createManagementLog(landlord, property.id, { scope: 'PRIVATE', type: 'REPAIR', title: '누수', occurredOn: TODAY });
    // 세션은 TICKET으로 받아도 붙일 곳에서 다시 본다
    const registered = await uploadVideo(landlord, { target: 'TICKET', documentType: 'PHOTO', resource: { resourceType: 'MANAGEMENT_LOG', resourceId: log.id } });
    assert.equal(registered.status, 422);
    assert.equal(registered.body.error.code, 'FILE_TYPE_NOT_ALLOWED');
    // 남의 하우스 로그면 형식보다 404가 먼저
    const stranger = await createUser('LANDLORD');
    const strangerVideo = await uploadVideo(stranger, { target: 'TICKET', documentType: 'PHOTO', resource: { resourceType: 'MANAGEMENT_LOG', resourceId: log.id } });
    assert.equal(strangerVideo.status, 404);
  });

  test('붙이기 4경로: 수리 요청 생성은 동영상을 받고, 하우스 로그·메시지·갱신 통지는 422', async () => {
    const { landlord, tenant, property } = await setup();
    const tenantVideo = await uploadVideo(tenant, { content: MOV, mimeType: 'video/quicktime', target: 'TICKET', documentType: 'PHOTO' });
    assert.equal(tenantVideo.status, 201);
    const ticket = await createTicket(tenant, {
      propertyId: property.id,
      category: 'REPAIR',
      title: '보일러 누수',
      description: '영상 첨부',
      attachmentDocumentIds: [tenantVideo.body.data.id],
    });
    assert.equal(ticket.attachments.length, 1);
    assert.equal(ticket.attachments[0].mimeType, 'video/quicktime');

    // 하우스 로그 작성
    const logVideo = await uploadVideo(landlord, { target: 'TICKET', documentType: 'PHOTO' });
    await rejectsWith(
      createManagementLog(landlord, property.id, { scope: 'PRIVATE', type: 'REPAIR', title: '영상', occurredOn: TODAY, attachmentDocumentIds: [logVideo.body.data.id] }),
      'FILE_TYPE_NOT_ALLOWED',
    );
    // 메시지·갱신 통지(같은 공용 함수). 막히면 문서는 미연결로 남는다(트랜잭션 되돌림).
    for (const resourceType of [MANAGEMENT_LOG_RESOURCE, RENEWAL_NOTICE_RESOURCE]) {
      await rejectsWith(
        prisma.$transaction((tx) =>
          attachDocumentsInTx(tx, landlord, { resourceType, resourceId: randomUUID(), documentIds: [logVideo.body.data.id], now: new Date() }),
        ),
        'FILE_TYPE_NOT_ALLOWED',
      );
    }
    const stillUnattached = await prisma.document.findUnique({ where: { id: logVideo.body.data.id } });
    assert.equal(stillUnattached.resourceType, null);
    // 사진은 하우스 로그에 그대로 붙는다(회귀)
    const photo = await createSession(landlord, { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG.length, documentType: 'PHOTO', targetResourceType: undefined });
    assert.equal((await putContent(photo.body.data.uploadUrl, JPEG, 'image/jpeg')).status, 204);
    const photoDoc = await postJson(landlord, '/documents', { uploadSessionId: photo.body.data.id });
    await prisma.$transaction((tx) =>
      attachDocumentsInTx(tx, landlord, { resourceType: MANAGEMENT_LOG_RESOURCE, resourceId: randomUUID(), documentIds: [photoDoc.body.data.id], now: new Date() }),
    );
    // 남의 동영상 id는 형식보다 404가 먼저
    await rejectsWith(
      prisma.$transaction((tx) =>
        attachDocumentsInTx(tx, tenant, { resourceType: TICKET_RESOURCE, resourceId: randomUUID(), documentIds: [logVideo.body.data.id], now: new Date() }),
      ),
      'DOCUMENT_NOT_FOUND',
    );
  });

  test('정리: 미연결 동영상은 6시간, 미연결 사진은 24시간 뒤에 정리한다', async () => {
    const user = await createUser('LANDLORD');
    const videoDoc = await uploadVideo(user, { target: 'TICKET', documentType: 'PHOTO' });
    const photo = await createSession(user, { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG.length, documentType: 'PHOTO', targetResourceType: undefined });
    assert.equal((await putContent(photo.body.data.uploadUrl, JPEG, 'image/jpeg')).status, 204);
    const photoDoc = await postJson(user, '/documents', { uploadSessionId: photo.body.data.id });
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
    await prisma.document.updateMany({ where: { id: { in: [videoDoc.body.data.id, photoDoc.body.data.id] } }, data: { createdAt: sevenHoursAgo } });

    await cleanupExpiredUploads();
    assert.notEqual((await prisma.document.findUnique({ where: { id: videoDoc.body.data.id } })).deletedAt, null);
    assert.equal((await prisma.document.findUnique({ where: { id: photoDoc.body.data.id } })).deletedAt, null);
  });
});

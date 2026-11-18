// 알림 설정 API(api-contract.md 7장, #159)와 끈 type을 notify가 만들지 않는지(실제 로컬 Postgres).
// RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js). 실제 app을 띄워 HTTP로 부른다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { NOTIFICATION_TYPES, notify } from '../../../src/platform/notify.js';
import { prisma } from '../../../src/platform/prismaClient.js';

describe('알림 설정 API', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  let server;
  let origin;

  before(async () => {
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const id of userIds) await prisma.rateLimit.deleteMany({ where: { id: { contains: id } } });
    await fixture.cleanup();
  });

  const createUser = async (role = 'LANDLORD') => {
    const user = await fixture.createUser(role);
    userIds.push(user.id);
    return user;
  };

  const api = async (user, method, body) => {
    const response = await fetch(`${origin}/api/v1/notification-preferences`, {
      method,
      headers: {
        ...(user ? { Cookie: `access_token=${signAccessToken(user)}` } : {}),
        'X-Requested-With': 'butler-web',
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };

  test('처음에는 기본값, 보낸 칸만 바뀌고 중복 type은 합친다', async () => {
    const user = await createUser('TENANT');
    assert.deepEqual((await api(user, 'GET')).body.data, { webPushEnabled: true, mutedTypes: [] });

    const muted = await api(user, 'PATCH', { mutedTypes: ['RENT_PAYMENT_DUE', 'RENT_PAYMENT_DUE'] });
    assert.equal(muted.status, 200);
    assert.deepEqual(muted.body.data, { webPushEnabled: true, mutedTypes: ['RENT_PAYMENT_DUE'] });

    const push = await api(user, 'PATCH', { webPushEnabled: false });
    assert.deepEqual(push.body.data, { webPushEnabled: false, mutedTypes: ['RENT_PAYMENT_DUE'] });
    assert.deepEqual((await api(user, 'GET')).body.data, push.body.data);
  });

  test('모르는 type·빈 요청·모르는 칸은 400, 로그인 안 하면 401', async () => {
    const user = await createUser();
    assert.equal((await api(user, 'PATCH', { mutedTypes: ['NOPE'] })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await api(user, 'PATCH', {})).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await api(user, 'PATCH', { userId: user.id })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await api(user, 'PATCH', { webPushEnabled: 'yes' })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await api(null, 'GET')).status, 401);
  });

  test('끈 type은 notify가 만들지 않는다(다른 type은 만든다)', async () => {
    const user = await createUser();
    await api(user, 'PATCH', { mutedTypes: ['TENANT_INVITATION_ACCEPTED'] });
    const base = { userId: user.id, title: 't', body: 'b' };
    assert.equal(await notify(prisma, { ...base, type: NOTIFICATION_TYPES.TENANT_INVITATION_ACCEPTED }), null);
    assert.notEqual(await notify(prisma, { ...base, type: NOTIFICATION_TYPES.TICKET_CREATED }), null);
    assert.equal(await prisma.notification.count({ where: { userId: user.id } }), 1);
  });
});

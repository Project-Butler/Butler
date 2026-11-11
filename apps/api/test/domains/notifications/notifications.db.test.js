// 알림 API(api-contract.md 7장 "알림", 실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 실제 app을 띄워 HTTP로 부른다(인증·라우터 연결까지 확인).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { NOTIFICATION_TYPES, notify } from '../../../src/platform/notify.js';
import { prisma } from '../../../src/platform/prismaClient.js';

describe('알림 API', { skip: dbTestSkip }, () => {
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

  const api = async (user, pathname, init = {}) => {
    const response = await fetch(`${origin}/api/v1${pathname}`, {
      ...init,
      headers: {
        ...(user ? { Cookie: `access_token=${signAccessToken(user)}` } : {}),
        'X-Requested-With': 'butler-web',
        'Content-Type': 'application/json',
      },
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  const post = (user, pathname) => api(user, pathname, { method: 'POST', body: '{}' });

  // createdAt을 1초씩 벌려 만든다(정렬·커서 확인용). 0번이 가장 오래된 것.
  const seed = async (user, count, base = Date.now() - 3600_000) => {
    const created = [];
    for (let index = 0; index < count; index += 1) {
      const row = await notify(prisma, {
        userId: user.id,
        type: NOTIFICATION_TYPES.TENANT_INVITATION_ACCEPTED,
        title: `알림 ${index}`,
        body: '임차인이 초대를 수락했어요',
        link: `/contracts/${randomUUID()}`,
      });
      created.push(await prisma.notification.update({ where: { id: row.id }, data: { createdAt: new Date(base + index * 1000) } }));
    }
    return created;
  };

  test('notify는 트랜잭션 안에서 행을 만들고, 롤백되면 남지 않는다', async () => {
    const user = await createUser();
    const contractId = randomUUID();
    const row = await prisma.$transaction((tx) =>
      notify(tx, {
        userId: user.id,
        type: NOTIFICATION_TYPES.TENANT_INVITATION_VERIFY_FAILED,
        title: '본인 확인 실패',
        body: '초대 링크 본인 확인이 여러 번 실패했어요',
        link: `/contracts/${contractId}`,
        related: { resourceType: 'CONTRACT', resourceId: contractId },
      }),
    );
    assert.equal(row.relatedType, 'CONTRACT');
    assert.equal(row.relatedId, contractId);
    assert.equal(row.readAt, null);

    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await notify(tx, { userId: user.id, type: NOTIFICATION_TYPES.TENANT_INVITATION_ACCEPTED, title: 't', body: 'b' });
        throw new Error('rollback');
      }),
      /rollback/,
    );
    assert.equal(await prisma.notification.count({ where: { userId: user.id } }), 1);

    const { status, body } = await api(user, '/notifications');
    assert.equal(status, 200);
    assert.deepEqual(body.data[0], {
      id: row.id,
      type: 'TENANT_INVITATION_VERIFY_FAILED',
      title: '본인 확인 실패',
      body: '초대 링크 본인 확인이 여러 번 실패했어요',
      link: `/contracts/${contractId}`,
      related: { resourceType: 'CONTRACT', resourceId: contractId },
      readAt: null,
      createdAt: row.createdAt.toISOString(),
    });
  });

  test('목록: 최신순 커서, related 없으면 null, 끝 쪽은 nextCursor null', async () => {
    const user = await createUser('TENANT');
    const rows = await seed(user, 5);

    const first = await api(user, '/notifications?size=2');
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.data.map((item) => item.title), ['알림 4', '알림 3']);
    assert.equal(first.body.data[0].related, null);
    assert.equal(first.body.meta.hasNext, true);

    const second = await api(user, `/notifications?size=2&cursor=${first.body.meta.nextCursor}`);
    assert.deepEqual(second.body.data.map((item) => item.title), ['알림 2', '알림 1']);

    const last = await api(user, `/notifications?size=2&cursor=${second.body.meta.nextCursor}`);
    assert.deepEqual(last.body.data.map((item) => item.id), [rows[0].id]);
    assert.deepEqual(last.body.meta, { nextCursor: null, hasNext: false });
  });

  test('목록: 잘못된 size·unreadOnly·cursor → 400, 비로그인 → 401', async () => {
    const user = await createUser();
    for (const query of ['size=0', 'size=101', 'unreadOnly=yes', 'cursor=bad']) {
      const { status, body } = await api(user, `/notifications?${query}`);
      assert.equal(status, 400, query);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal((await api(null, '/notifications')).status, 401);
    assert.equal((await api(null, '/notifications/unread-count')).status, 401);
  });

  test('읽음·안 읽은 수·unreadOnly·모두 읽음', async () => {
    const user = await createUser();
    const rows = await seed(user, 3);

    assert.deepEqual((await api(user, '/notifications/unread-count')).body, { data: { count: 3 } });

    const read = await post(user, `/notifications/${rows[1].id}/read`);
    assert.equal(read.status, 204);
    // 다시 읽어도 204, 읽은 시각은 그대로
    const readAt = (await prisma.notification.findUnique({ where: { id: rows[1].id } })).readAt;
    assert.ok(readAt);
    assert.equal((await post(user, `/notifications/${rows[1].id}/read`)).status, 204);
    assert.deepEqual((await prisma.notification.findUnique({ where: { id: rows[1].id } })).readAt, readAt);

    assert.deepEqual((await api(user, '/notifications/unread-count')).body.data, { count: 2 });
    const unread = await api(user, '/notifications?unreadOnly=true');
    assert.deepEqual(unread.body.data.map((item) => item.id), [rows[2].id, rows[0].id]);
    const all = await api(user, '/notifications?unreadOnly=false');
    assert.equal(all.body.data.length, 3);
    assert.equal(all.body.data[1].readAt, readAt.toISOString());

    assert.equal((await post(user, '/notifications/read-all')).status, 204);
    assert.deepEqual((await api(user, '/notifications/unread-count')).body.data, { count: 0 });
    assert.equal((await api(user, '/notifications?unreadOnly=true')).body.data.length, 0);
  });

  test('남의 알림: 목록에 안 보이고 읽음은 404, 모두 읽음도 남의 것은 건드리지 않는다', async () => {
    const owner = await createUser();
    const other = await createUser('TENANT');
    const [row] = await seed(owner, 1);

    assert.equal((await api(other, '/notifications')).body.data.length, 0);
    for (const id of [row.id, randomUUID(), 'not-a-uuid']) {
      const { status, body } = await post(other, `/notifications/${id}/read`);
      assert.equal(status, 404, id);
      assert.equal(body.error.code, 'NOTIFICATION_NOT_FOUND');
    }
    assert.equal((await post(other, '/notifications/read-all')).status, 204);
    assert.equal((await prisma.notification.findUnique({ where: { id: row.id } })).readAt, null);
  });
});

// 커뮤니티 서비스(실제 로컬 Postgres). RUN_DB_TESTS=1 일 때만 돈다(testSupport/dbTest.js).
// 단지·사용자는 A팀 createDbFixture 로 만들고, 그 정리가 모르는 커뮤니티 행(community_*)은 여기서 지운다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { prisma } from '../../../src/platform/prismaClient.js';
import { requireRegionMember, requireRegionOwner } from '../../../src/domains/community/platformBridge.js';
import {
  createComment,
  createPost,
  createPostReport,
  deletePost,
  findMyBuildings,
  findPostDetail,
  findPosts,
  updatePost,
} from '../../../src/domains/community/service.js';
import { setCommentHidden, setPollHidden, setPostHidden } from '../../../src/domains/community/service/admin.js';
import { collectNews, findNews } from '../../../src/domains/community/service/news.js';
import { castVote, createPoll, deletePoll, findPollDetail, findPolls } from '../../../src/domains/community/service/polls.js';

const REGION = '1135010600'; // createDbFixture 의 단지 법정동(서울 노원구 중계동)
const DAY = 24 * 60 * 60 * 1000;
const LIST = { page: 1, size: 100 };

describe('임대인 커뮤니티', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const newsIds = [];

  after(async () => {
    await prisma.communityReport.deleteMany({ where: { reporterId: { in: userIds } } });
    await prisma.communityComment.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.communityPost.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.communityPollVote.deleteMany({ where: { voterId: { in: userIds } } });
    await prisma.communityPoll.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.communityNewsItem.deleteMany({ where: { id: { in: newsIds } } });
    await fixture.cleanup();
  });

  const createUser = async (role = 'LANDLORD') => {
    const user = await fixture.createUser(role);
    userIds.push(user.id);
    return user;
  };

  // 호실 하나 + 소유 관계. status 기본 VERIFIED(유효 1년). expired 면 어제 만료.
  const addUnit = async (user, complex, { buildingNo = '101', unitNo = randomUUID().slice(0, 6), exclusiveArea = null, status = 'VERIFIED', verifiedAt = new Date(), expired = false } = {}) => {
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo, unitNo, exclusiveArea } });
    await prisma.ownership.create({
      data: {
        propertyId: property.id,
        userId: user.id,
        verificationStatus: status,
        verifiedAt: status === 'VERIFIED' ? verifiedAt : null,
        verificationExpiresAt: status === 'VERIFIED' ? new Date(Date.now() + (expired ? -DAY : 365 * DAY)) : null,
      },
    });
    return property;
  };

  const postInput = (complexId, title = '테스트 글') => ({ complexId, category: 'FREE', title, body: '본문' });
  const pollInput = (complexId, extra = {}) => ({
    scope: 'REGION',
    complexId,
    title: '테스트 투표',
    description: null,
    options: ['예', '아니오'],
    closesAt: new Date(Date.now() + 3 * DAY),
    ...extra,
  });

  describe('authorLabel', () => {
    test('단지명은 Complex.name 이다(임대인이 붙인 건물명이 아니다)', async () => {
      const user = await createUser();
      const complex = await fixture.createComplex({ name: '공식단지아파트' });
      await prisma.myBuilding.create({ data: { userId: user.id, complexId: complex.id, name: '내가 고친 이름' } });
      await addUnit(user, complex, { buildingNo: '103', unitNo: '1202' });

      const post = await createPost(user, REGION, postInput(complex.id));
      assert.equal(post.authorLabel, '공식단지아파트 103동 임대인');
    });

    test('동은 가장 먼저 인증한 호실의 것이고, 같으면 동 번호 순(자연 정렬)이다', async () => {
      const user = await createUser();
      const complex = await fixture.createComplex({ name: '순서아파트' });
      await addUnit(user, complex, { buildingNo: '103', verifiedAt: new Date(Date.now() - DAY) });
      await addUnit(user, complex, { buildingNo: '107', verifiedAt: new Date(Date.now() - 2 * DAY) });
      assert.equal((await createPost(user, REGION, postInput(complex.id))).authorLabel, '순서아파트 107동 임대인');

      const tied = await createUser();
      const same = new Date(Date.now() - DAY);
      await addUnit(tied, complex, { buildingNo: '10', verifiedAt: same });
      await addUnit(tied, complex, { buildingNo: '9', verifiedAt: same });
      assert.equal((await createPost(tied, REGION, postInput(complex.id))).authorLabel, '순서아파트 9동 임대인');
    });

    test('호수는 표기와 응답 어디에도 없다', async () => {
      const user = await createUser();
      const complex = await fixture.createComplex({ name: '호수없음아파트' });
      await addUnit(user, complex, { buildingNo: '201', unitNo: '1803' });

      const post = await createPost(user, REGION, postInput(complex.id));
      const comment = await createComment(user, await prisma.communityPost.findUnique({ where: { id: post.id } }), { complexId: complex.id, body: '댓글' });
      const detail = await findPostDetail(user, post.id);
      assert.ok(!JSON.stringify([post, comment, detail]).includes('1803'));
      assert.ok(!('authorId' in detail));
    });
  });

  describe('쓰기 자격', () => {
    const runMiddleware = (user) =>
      new Promise((resolve) => {
        requireRegionMember(() => REGION)({ user }, {}, (error) => resolve(error ?? null));
      });

    test('미인증 사용자는 requireRegionMember 에서 403 REGION_MEMBERSHIP_REQUIRED', async () => {
      const user = await createUser();
      const complex = await fixture.createComplex();
      await addUnit(user, complex, { status: 'UNVERIFIED' });
      const error = await runMiddleware(user);
      assert.equal(error?.code, 'REGION_MEMBERSHIP_REQUIRED');
      assert.equal(error?.httpStatus, 403);

      const verified = await createUser();
      await addUnit(verified, complex);
      assert.equal(await runMiddleware(verified), null);
    });

    test('남의 글 수정은 403 COMMUNITY_NOT_AUTHOR', async () => {
      const author = await createUser();
      const other = await createUser();
      const complex = await fixture.createComplex();
      await addUnit(author, complex);
      await addUnit(other, complex);
      const post = await createPost(author, REGION, postInput(complex.id));
      const row = await prisma.communityPost.findUnique({ where: { id: post.id } });
      await assert.rejects(updatePost(other, row, { title: '바꿈' }), { code: 'COMMUNITY_NOT_AUTHOR', httpStatus: 403 });
      await assert.rejects(deletePost(other, row), { code: 'COMMUNITY_NOT_AUTHOR' });
    });

    test('인증이 만료된 작성자도 자기 글은 지울 수 있다(쓰기 자격은 없다)', async () => {
      const user = await createUser();
      const complex = await fixture.createComplex();
      await addUnit(user, complex);
      const post = await createPost(user, REGION, postInput(complex.id, '만료 전 글'));
      await prisma.ownership.updateMany({ where: { userId: user.id }, data: { verificationExpiresAt: new Date(Date.now() - DAY) } });

      assert.equal((await runMiddleware(user))?.code, 'REGION_MEMBERSHIP_REQUIRED');
      await deletePost(user, await prisma.communityPost.findUnique({ where: { id: post.id } }));
      assert.ok((await prisma.communityPost.findUnique({ where: { id: post.id } })).deletedAt);
    });

    test('writeBlockedReason: 인증 null · 만료 EXPIRED · 미인증 UNVERIFIED', async () => {
      const complex = await fixture.createComplex();
      const verified = await createUser();
      await addUnit(verified, complex);
      const expired = await createUser();
      await addUnit(expired, complex, { expired: true });
      const unverified = await createUser();
      await addUnit(unverified, complex, { status: 'UNVERIFIED' });
      const tenant = await createUser('TENANT');

      const reasonOf = async (user) => (await findPosts(user, REGION, { ...LIST, size: 1 })).meta;
      assert.deepEqual(
        await Promise.all([verified, expired, unverified, tenant].map(async (user) => {
          const meta = await reasonOf(user);
          return [meta.canWrite, meta.writeBlockedReason];
        })),
        [[true, null], [false, 'EXPIRED'], [false, 'UNVERIFIED'], [false, 'UNVERIFIED']],
      );
    });
  });

  describe('투표', () => {
    const setup = async () => {
      const complex = await fixture.createComplex({ name: '투표아파트' });
      const author = await createUser();
      const voter = await createUser();
      await addUnit(author, complex);
      await addUnit(voter, complex);
      return { complex, author, voter };
    };
    const pollRow = (id) => prisma.communityPoll.findUnique({ where: { id } });

    test('1인 1표 — 같은 사람이 다시 참여하면 409 COMMUNITY_ALREADY_VOTED', async () => {
      const { complex, author, voter } = await setup();
      const poll = await createPoll(author, REGION, pollInput(complex.id));
      await castVote(voter, await pollRow(poll.id), { optionId: poll.options[0].id });
      await assert.rejects(castVote(voter, await pollRow(poll.id), { optionId: poll.options[1].id }), {
        code: 'COMMUNITY_ALREADY_VOTED',
        httpStatus: 409,
      });
      assert.equal((await pollRow(poll.id)).voteCount, 1);
    });

    test('마감 전에는 득표를 주지 않고, 마감(closesAt 지남) 뒤에는 득표·비율을 준다', async () => {
      const { complex, author, voter } = await setup();
      const poll = await createPoll(author, REGION, pollInput(complex.id));
      await castVote(voter, await pollRow(poll.id), { optionId: poll.options[1].id });

      const open = await findPollDetail(author, poll.id);
      assert.equal(open.isClosed, false);
      assert.equal(open.voteCount, 1);
      assert.ok(open.options.every((option) => !('voteCount' in option) && !('percent' in option)));

      await prisma.communityPoll.update({ where: { id: poll.id }, data: { closesAt: new Date(Date.now() - 1000) } });
      const closed = await findPollDetail(author, poll.id);
      assert.equal(closed.isClosed, true);
      assert.deepEqual(closed.options.map((option) => [option.voteCount, option.percent]), [[0, 0], [1, 100]]);
    });

    test('마감 뒤 참여는 409 COMMUNITY_POLL_CLOSED', async () => {
      const { complex, author, voter } = await setup();
      const poll = await createPoll(author, REGION, pollInput(complex.id));
      await prisma.communityPoll.update({ where: { id: poll.id }, data: { closesAt: new Date(Date.now() - 1000) } });
      await assert.rejects(castVote(voter, await pollRow(poll.id), { optionId: poll.options[0].id }), { code: 'COMMUNITY_POLL_CLOSED' });
    });

    test('우리 단지(COMPLEX) 투표에 같은 동 다른 단지 인증자가 참여하면 403', async () => {
      const { complex, author } = await setup();
      const neighbor = await createUser();
      await addUnit(neighbor, await fixture.createComplex({ name: '옆단지아파트' }));
      const poll = await createPoll(author, REGION, pollInput(complex.id, { scope: 'COMPLEX' }));
      await assert.rejects(castVote(neighbor, await pollRow(poll.id), { optionId: poll.options[0].id }), {
        code: 'COMMUNITY_POLL_NOT_ELIGIBLE',
        httpStatus: 403,
      });
    });

    test('참여자가 있는 투표는 지울 수 없다(409), 없으면 지워지고 목록에서 빠진다', async () => {
      const { complex, author, voter } = await setup();
      const voted = await createPoll(author, REGION, pollInput(complex.id));
      await castVote(voter, await pollRow(voted.id), { optionId: voted.options[0].id });
      await assert.rejects(deletePoll(author, await pollRow(voted.id)), { code: 'COMMUNITY_POLL_HAS_VOTES', httpStatus: 409 });

      const empty = await createPoll(author, REGION, pollInput(complex.id));
      await deletePoll(author, await pollRow(empty.id));
      const ids = (await findPolls(author, REGION, { ...LIST, status: 'OPEN' })).items.map((item) => item.id);
      assert.ok(ids.includes(voted.id));
      assert.ok(!ids.includes(empty.id));
    });

    test('운영자가 숨긴 투표는 목록에서 빠지고 해제하면 돌아온다', async () => {
      const { complex, author } = await setup();
      const admin = await createUser('ADMIN');
      const poll = await createPoll(author, REGION, pollInput(complex.id));
      const listed = async () => (await findPolls(author, REGION, { ...LIST, status: 'OPEN' })).items.some((item) => item.id === poll.id);

      await setPollHidden(admin, poll.id, true);
      assert.equal(await listed(), false);
      await assert.rejects(findPollDetail(author, poll.id), { code: 'COMMUNITY_POLL_NOT_FOUND' });
      await setPollHidden(admin, poll.id, false);
      assert.equal(await listed(), true);
    });
  });

  describe('신고·숨김', () => {
    test('같은 사람이 같은 글을 두 번 신고하면 409 COMMUNITY_ALREADY_REPORTED', async () => {
      const complex = await fixture.createComplex();
      const author = await createUser();
      const reporter = await createUser();
      await addUnit(author, complex);
      await addUnit(reporter, complex);
      const post = await prisma.communityPost.findUnique({ where: { id: (await createPost(author, REGION, postInput(complex.id))).id } });
      await createPostReport(reporter, post, { reason: 'SPAM', detail: null });
      await assert.rejects(createPostReport(reporter, post, { reason: 'ABUSE', detail: null }), { code: 'COMMUNITY_ALREADY_REPORTED' });
    });

    test('숨긴 글은 목록·상세에서, 숨긴 댓글은 상세와 댓글 수에서 빠진다', async () => {
      const complex = await fixture.createComplex();
      const author = await createUser();
      const admin = await createUser('ADMIN');
      await addUnit(author, complex);
      const created = await createPost(author, REGION, postInput(complex.id, '숨김 테스트'));
      const post = await prisma.communityPost.findUnique({ where: { id: created.id } });
      const comment = await createComment(author, post, { complexId: complex.id, body: '숨길 댓글' });
      await createComment(author, post, { complexId: complex.id, body: '남을 댓글' });

      await setCommentHidden(admin, comment.id, true);
      await setCommentHidden(admin, comment.id, true); // 두 번 숨겨도 한 번만 센다
      let detail = await findPostDetail(author, post.id);
      assert.equal(detail.commentCount, 1);
      assert.deepEqual(detail.comments.map((item) => item.body), ['남을 댓글']);
      assert.equal((await findPosts(author, REGION, LIST)).items.find((item) => item.id === post.id).commentCount, 1);

      await setCommentHidden(admin, comment.id, false);
      detail = await findPostDetail(author, post.id);
      assert.equal(detail.commentCount, 2);

      await setPostHidden(admin, post.id, true);
      assert.ok(!(await findPosts(author, REGION, LIST)).items.some((item) => item.id === post.id));
      await assert.rejects(findPostDetail(author, post.id), { code: 'COMMUNITY_POST_NOT_FOUND' });
      const row = await prisma.communityPost.findUnique({ where: { id: post.id } });
      assert.equal(row.hiddenByUserId, admin.id);
      assert.equal(row.deletedAt, null); // 숨김과 삭제는 따로 저장
    });
  });

  describe('뉴스', () => {
    // 네트워크를 부르지 않게 공급자의 fetch 를 고정 응답으로 바꿔 끼운다(collectNews 옵션).
    // 검색어 첫 낱말(intitle: 은 떼고 — 구 약칭·동 이름·시·도 약칭·"국토교통부")을 제목에 넣어 걸러내기를 통과하게 하고,
    // 통과 못 할 제목도 하나 섞는다.
    const runId = randomUUID();
    const linkOf = (key) => `https://news.google.com/rss/articles/DBTEST-${runId}-${key}`;
    const testRows = { url: { startsWith: `https://news.google.com/rss/articles/DBTEST-${runId}-` } };
    const item = (title, key) =>
      `<item><title>${title} - 테스트일보</title><link>${linkOf(key)}</link><pubDate>Mon, 26 Oct 2026 03:00:00 GMT</pubDate><source url="https://press.example">테스트일보</source></item>`;
    const fetchImpl = async (url) => {
      const name = new URL(url).searchParams.get('q').split(' ')[0].replace(/^intitle:/, '');
      const xml = `<rss><channel>${item(`${name} 아파트 전세 매물 증가`, `${name}-pass`)}${item(`${name} 가을 축제 개막`, `${name}-drop`)}</channel></rss>`;
      return new Response(xml, { status: 200 });
    };

    after(async () => {
      newsIds.push(...(await prisma.communityNewsItem.findMany({ where: testRows, select: { id: true } })).map((row) => row.id));
    });

    test('받기에 실패하면 아무것도 넣지 않는다 — 개발·배포 모두 가짜 기사로 채우지 않는다', async () => {
      const savedEnv = process.env.NODE_ENV;
      const warn = console.warn;
      const info = console.info;
      console.warn = () => {};
      console.info = () => {};
      try {
        for (const env of ['production', 'development']) {
          process.env.NODE_ENV = env;
          const before = await prisma.communityNewsItem.count();
          const result = await collectNews({ fetchImpl: async () => new Response('', { status: 503 }) });
          assert.equal(result.inserted, 0);
          assert.ok(result.results.every((row) => row.fetched === 0));
          assert.equal(await prisma.communityNewsItem.count(), before);
        }
        assert.equal(await prisma.communityNewsItem.count({ where: { url: { startsWith: 'https://example.com/' } } }), 0);
      } finally {
        console.warn = warn;
        console.info = info;
        if (savedEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = savedEnv;
      }
    });

    test('걸러진 기사는 저장하지 않고, 시·도(SIDO)도 저장하며, 두 번 수집해도 한 건이다', async () => {
      // 이 테스트 묶음의 인증 사용자가 노원구(서울)에 있으므로 대상에 서울(SIDO 11)과 노원구(SIGUNGU 11350)가 들어간다
      const user = await createUser();
      await addUnit(user, await fixture.createComplex({ name: '뉴스테스트아파트' }));
      const info = console.info;
      console.info = () => {};
      try {
        const first = await collectNews({ fetchImpl });
        const byScope = Object.fromEntries(first.results.map((row) => [row.scopeCode ?? '전국', row]));
        assert.ok(byScope['11'] && byScope['11'].scope === 'SIDO', JSON.stringify(Object.keys(byScope)));
        assert.ok(byScope['11350'] && byScope['11350'].scope === 'SIGUNGU');
        // 시·도: 검색어 셋이 같은 기사 둘을 돌려줘도 둘, 그중 축제 기사는 걸러짐
        assert.deepEqual([byScope['11'].fetched, byScope['11'].filtered], [2, 1]);
        // 시·군·구: "intitle:노원 …" 셋 + 인증 동 "{동} 아파트" — 첫 낱말마다 기사 둘, 그중 축제 기사는 걸러짐
        const sigunguRow = byScope['11350'];
        assert.ok(sigunguRow.fetched >= 4 && sigunguRow.fetched % 2 === 0, JSON.stringify(sigunguRow));
        assert.equal(sigunguRow.filtered, sigunguRow.fetched / 2);
        // 전국: 검색어 첫 낱말이 둘(국토교통부·주택임대차보호법)이라 기사 넷. "국토교통부 … 축제"만 걸러진다 —
        // "주택임대차보호법 … 축제"는 제목에 "임대차"가 있어 통과(전국은 부동산 낱말만 본다)
        assert.deepEqual([byScope['전국'].fetched, byScope['전국'].filtered], [4, 1]);

        const saved = await prisma.communityNewsItem.findMany({ where: testRows, select: { scope: true, scopeCode: true, title: true, publisher: true } });
        assert.ok(saved.filter((row) => row.scope !== 'NATIONWIDE').every((row) => !row.title.includes('축제')));
        assert.ok(saved.some((row) => row.scope === 'SIDO' && row.scopeCode === '11' && row.title === '서울 아파트 전세 매물 증가'));
        assert.ok(saved.some((row) => row.scope === 'SIGUNGU' && row.scopeCode === '11350' && row.title === '노원 아파트 전세 매물 증가'));
        assert.ok(saved.every((row) => row.publisher === '테스트일보'));

        const second = await collectNews({ fetchImpl });
        assert.equal(second.inserted, 0);
        assert.equal(await prisma.communityNewsItem.count({ where: testRows }), saved.length);
      } finally {
        console.info = info;
      }
    });

    test('시·군·구 기사가 최근 30일 5건 미만이면 sidoFallback, 5건이면 아니다(30일보다 오래된 것은 세지 않는다)', async () => {
      const sigungu = '11350';
      const before = await prisma.communityNewsItem.count({ where: { scope: 'SIGUNGU', scopeCode: sigungu } });
      const add = (key, daysAgo) =>
        prisma.communityNewsItem.create({
          data: {
            source: 'NEWS_SEARCH',
            scope: 'SIGUNGU',
            scopeCode: sigungu,
            title: `노원구 아파트 ${key}`,
            url: linkOf(`fallback-${key}`),
            urlHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
            publishedAt: new Date(Date.now() - daysAgo * DAY),
          },
        });
      // 다른 테스트가 넣은 노원구 기사가 있으면 기준이 흔들리므로, 새로 넣는 수를 거기에 맞춘다
      const recentBefore = await prisma.communityNewsItem.count({ where: { scope: 'SIGUNGU', scopeCode: sigungu, publishedAt: { gte: new Date(Date.now() - 30 * DAY) } } });
      assert.ok(recentBefore < 5, `노원구 최근 기사가 이미 ${recentBefore}건`);
      for (let n = recentBefore; n < 4; n += 1) await add(`recent-${n}`, 20); // 20일 전 — 7일 기준이면 세지 않았을 것
      await add('old', 40);
      const fallback = async () => (await findNews(REGION, { scope: 'SIGUNGU', page: 1, size: 20 })).meta.sidoFallback;
      assert.equal(await fallback(), true); // 최근 4건 + 오래된 1건
      await add('recent-4', 1);
      assert.equal(await fallback(), false); // 최근 5건
      assert.ok((await prisma.communityNewsItem.count({ where: { scope: 'SIGUNGU', scopeCode: sigungu } })) > before);
      const sido = await findNews(REGION, { scope: 'SIDO', page: 1, size: 10 });
      assert.equal(sido.meta.region.sidoLabel, '서울');
      assert.ok(!('sidoFallback' in sido.meta));
    });
  });

  describe('인증 전 미리보기', () => {
    const runOwner = (user, legalDongCode = REGION) =>
      new Promise((resolve) => {
        requireRegionOwner(() => legalDongCode)({ user }, {}, (error) => resolve(error ?? null));
      });
    const OTHER_REGION = '1171010100'; // 시드에 있는 다른 법정동(서울 송파구 잠실동)

    test('읽기 자격: 그 동네 호실 등록자는 인증이 없어도 통과, 다른 동네 임대인 · 임차인 · 끝난 소유는 403 COMMUNITY_REGION_OWNER_REQUIRED', async () => {
      const complex = await fixture.createComplex();
      const unverified = await createUser();
      await addUnit(unverified, complex, { status: 'UNVERIFIED' });
      const expiredOwner = await createUser();
      await addUnit(expiredOwner, complex, { expired: true });
      assert.equal(await runOwner(unverified), null);
      assert.equal(await runOwner(expiredOwner), null);

      const elsewhere = await createUser();
      await addUnit(elsewhere, complex);
      const otherDong = await runOwner(elsewhere, OTHER_REGION);
      assert.equal(otherDong?.code, 'COMMUNITY_REGION_OWNER_REQUIRED');
      assert.equal(otherDong?.httpStatus, 403);

      const tenant = await createUser('TENANT');
      assert.equal((await runOwner(tenant))?.code, 'COMMUNITY_REGION_OWNER_REQUIRED');

      const sold = await createUser();
      await addUnit(sold, complex);
      await prisma.ownership.updateMany({ where: { userId: sold.id }, data: { endedAt: new Date() } });
      assert.equal((await runOwner(sold))?.code, 'COMMUNITY_REGION_OWNER_REQUIRED');
    });

    test('글 상세: 인증한 사람은 본문 · 댓글까지, 인증 전 · 만료는 locked 이고 body · comments 가 응답에 없다', async () => {
      const complex = await fixture.createComplex({ name: '미리보기아파트' });
      const author = await createUser();
      await addUnit(author, complex);
      const post = await createPost(author, REGION, postInput(complex.id, '잠긴 글'));
      await createComment(author, post, { complexId: complex.id, body: '첫 댓글' });

      const verified = await findPostDetail(author, post.id);
      assert.equal(verified.locked, false);
      assert.equal(verified.body, '본문');
      assert.equal(verified.comments.length, 1);

      for (const options of [{ status: 'UNVERIFIED' }, { expired: true }]) {
        const viewer = await createUser();
        await addUnit(viewer, complex, options);
        const locked = await findPostDetail(viewer, post.id);
        assert.equal(locked.locked, true);
        assert.ok(!('body' in locked), 'body 가 없어야 한다');
        assert.ok(!('comments' in locked), 'comments 가 없어야 한다');
        assert.equal(locked.title, '잠긴 글');
        assert.equal(locked.commentCount, 1);
        assert.equal(locked.authorLabel, '미리보기아파트 101동 임대인');
        assert.equal(locked.canWrite, false);
        assert.equal(locked.writeBlockedReason, options.expired ? 'EXPIRED' : 'UNVERIFIED');
      }
    });

    test('글 목록: 인증 전에도 지금 그대로(목록에는 원래 본문이 없다)', async () => {
      const complex = await fixture.createComplex();
      const author = await createUser();
      await addUnit(author, complex);
      await createPost(author, REGION, postInput(complex.id, '목록 글'));
      const viewer = await createUser();
      await addUnit(viewer, complex, { status: 'UNVERIFIED' });

      const { items, meta } = await findPosts(viewer, REGION, LIST);
      const item = items.find((row) => row.title === '목록 글');
      assert.ok(item);
      assert.deepEqual(Object.keys(item).sort(), ['authorLabel', 'category', 'commentCount', 'createdAt', 'id', 'isMine', 'title']);
      assert.equal(meta.canWrite, false);
    });

    test('투표 상세: 인증 전에는 질문 · 범위 · 마감 · 참여 인원만 — 선택지 · 내 참여 · 득표 · 비율이 응답에 없다(마감 뒤에도)', async () => {
      const complex = await fixture.createComplex();
      const author = await createUser();
      await addUnit(author, complex);
      const poll = await createPoll(author, REGION, pollInput(complex.id, { title: '잠긴 투표' }));
      await castVote(author, await prisma.communityPoll.findUnique({ where: { id: poll.id } }), { optionId: poll.options[0].id });

      const verified = await findPollDetail(author, poll.id);
      assert.equal(verified.locked, false);
      assert.equal(verified.options.length, 2);
      assert.equal(verified.hasVoted, true);

      const viewer = await createUser();
      await addUnit(viewer, complex, { status: 'UNVERIFIED' });
      const lockedOpen = await findPollDetail(viewer, poll.id);
      await prisma.communityPoll.update({ where: { id: poll.id }, data: { closesAt: new Date(Date.now() - DAY) } });
      const lockedClosed = await findPollDetail(viewer, poll.id);
      for (const locked of [lockedOpen, lockedClosed]) {
        assert.equal(locked.locked, true);
        for (const key of ['options', 'hasVoted', 'myOptionId', 'canVote', 'isEligible', 'myUnitCount', 'description', 'authorLabel']) {
          assert.ok(!(key in locked), key + ' 가 없어야 한다');
        }
        assert.equal(locked.title, '잠긴 투표');
        assert.equal(locked.scope, 'REGION');
        assert.equal(locked.voteCount, 1);
        assert.ok(locked.closesAt);
      }
      assert.equal(lockedClosed.isClosed, true);
    });
  });

  describe('my-buildings', () => {
    test('인증 전 · 만료 건물도 상태와 함께 나온다. 인증된 건물이 먼저, my_buildings 이름을 바꾸면 따라온다', async () => {
      const user = await createUser();
      const ok = await fixture.createComplex({ name: '인증아파트' });
      const pending = await fixture.createComplex({ name: '미인증아파트' });
      const expired = await fixture.createComplex({ name: '만료아파트' });
      for (const complex of [ok, pending, expired]) {
        await prisma.myBuilding.create({ data: { userId: user.id, complexId: complex.id, name: complex.name } });
      }
      await addUnit(user, ok);
      await addUnit(user, ok);
      const pendingUnits = [];
      for (let i = 0; i < 3; i += 1) pendingUnits.push(await addUnit(user, pending, { status: 'UNVERIFIED' }));
      const expiredUnit = await addUnit(user, expired, { expired: true });

      let buildings = await findMyBuildings(user);
      assert.deepEqual(
        buildings.map((b) => [b.name, b.unitCount, b.verificationStatus]),
        [['인증아파트', 2, 'VERIFIED'], ['미인증아파트', 3, 'UNVERIFIED'], ['만료아파트', 1, 'EXPIRED']],
      );
      const byName = Object.fromEntries(buildings.map((b) => [b.name, b]));
      assert.equal(byName['인증아파트'].verifyPropertyId, null);
      assert.equal(byName['만료아파트'].verifyPropertyId, expiredUnit.id);
      assert.ok(pendingUnits.map((unit) => unit.id).includes(byName['미인증아파트'].verifyPropertyId));

      await prisma.myBuilding.updateMany({ where: { userId: user.id, complexId: ok.id }, data: { name: '바꾼 이름' } });
      buildings = await findMyBuildings(user);
      assert.equal(buildings[0].name, '바꾼 이름');
      assert.equal(buildings[0].regionName, '서울특별시 노원구 중계동');
    });

    test('verifyPropertyId: 만료 호실을 먼저, 같으면 동 · 호 자연순. 끝난 소유 관계 건물은 나오지 않는다', async () => {
      const user = await createUser();
      const mixed = await fixture.createComplex({ name: '섞인아파트' });
      const soldOut = await fixture.createComplex({ name: '판아파트' });
      for (const complex of [mixed, soldOut]) {
        await prisma.myBuilding.create({ data: { userId: user.id, complexId: complex.id, name: complex.name } });
      }
      await addUnit(user, mixed, { buildingNo: '102', unitNo: '101', status: 'UNVERIFIED' });
      const expired = await addUnit(user, mixed, { buildingNo: '110', unitNo: '1201', expired: true });
      const first = await addUnit(user, mixed, { buildingNo: '101', unitNo: '901', status: 'UNVERIFIED' });
      const sold = await addUnit(user, soldOut, { status: 'UNVERIFIED' });
      await prisma.ownership.updateMany({ where: { propertyId: sold.id }, data: { endedAt: new Date() } });

      const buildings = await findMyBuildings(user);
      assert.deepEqual(buildings.map((b) => b.name), ['섞인아파트']);
      assert.equal(buildings[0].verificationStatus, 'EXPIRED');
      assert.equal(buildings[0].verifyPropertyId, expired.id);

      // 만료가 없으면 미인증 중 동 · 호 자연순 첫 호실(101동 901호)
      await prisma.ownership.updateMany({ where: { propertyId: expired.id }, data: { endedAt: new Date() } });
      const [again] = await findMyBuildings(user);
      assert.equal(again.verificationStatus, 'UNVERIFIED');
      assert.equal(again.verifyPropertyId, first.id);
    });

    test('unitAreas 는 그 건물의 활성 호실 전용면적(인증 여부 무관, 면적 없는 호실 · 남의 호실은 빠짐, 동 · 호수 없음)', async () => {
      const user = await createUser();
      const other = await createUser();
      const complex = await fixture.createComplex({ name: '면적아파트' });
      await prisma.myBuilding.create({ data: { userId: user.id, complexId: complex.id, name: complex.name } });
      await addUnit(user, complex, { exclusiveArea: '84.97' });
      await addUnit(user, complex, { exclusiveArea: '59.84' });
      await addUnit(user, complex); // 면적 없음
      await addUnit(user, complex, { exclusiveArea: '101.23', expired: true });
      await addUnit(user, complex, { exclusiveArea: '120.5', status: 'UNVERIFIED' });
      await addUnit(other, complex, { exclusiveArea: '33.1' }); // 남의 호실

      const [building] = await findMyBuildings(user);
      assert.equal(building.unitCount, 5);
      assert.equal(building.verificationStatus, 'VERIFIED');
      assert.equal(building.verifyPropertyId, null);
      assert.deepEqual([...building.unitAreas].sort((a, b) => a - b), [59.84, 84.97, 101.23, 120.5]);
      assert.ok(building.unitAreas.every((area) => typeof area === 'number'));
      assert.deepEqual(Object.keys(building).sort(), [
        'complexId', 'legalDongCode', 'memberCount', 'name', 'regionName', 'unitAreas', 'unitCount',
        'verificationStatus', 'verifyPropertyId',
      ]);
    });
  });
});

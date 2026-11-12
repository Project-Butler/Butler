// 커뮤니티 서비스(실제 로컬 Postgres). RUN_DB_TESTS=1 일 때만 돈다(testSupport/dbTest.js).
// 단지·사용자는 A팀 createDbFixture 로 만들고, 그 정리가 모르는 커뮤니티 행(community_*)은 여기서 지운다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { prisma } from '../../../src/platform/prismaClient.js';
import { listAllOwnedComplexIds, requireRegionMember, requireRegionOwner } from '../../../src/domains/community/platformBridge.js';
import { COMPLEX_MAX_PER_RUN } from '../../../src/domains/community/newsRules.js';
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
import { buildComplexNewsTargets, buildNewsTargets, collectAllNews, collectComplexNews, collectNews, findNews } from '../../../src/domains/community/service/news.js';
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
    // 단지 수집 순번(community_news_cursors)은 단지에 FK 가 없어 단지를 지워도 남는다 — 지워진 단지의 행을 치운다
    const cursorCodes = (await prisma.communityNewsCursor.findMany({ where: { scope: 'COMPLEX' }, select: { scopeCode: true } })).map((row) => row.scopeCode);
    const alive = new Set((await prisma.complex.findMany({ where: { id: { in: cursorCodes } }, select: { id: true } })).map((row) => row.id));
    await prisma.communityNewsCursor.deleteMany({ where: { scope: 'COMPLEX', scopeCode: { in: cursorCodes.filter((code) => !alive.has(code)) } } });
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

    test('한 사람 한 번 참여 — 같은 사람이 다시 참여하면 409 COMMUNITY_ALREADY_VOTED', async () => {
      const { complex, author, voter } = await setup();
      const poll = await createPoll(author, REGION, pollInput(complex.id));
      await castVote(voter, await pollRow(poll.id), { optionId: poll.options[0].id });
      await assert.rejects(castVote(voter, await pollRow(poll.id), { optionId: poll.options[1].id }), {
        code: 'COMMUNITY_ALREADY_VOTED',
        httpStatus: 409,
      });
      assert.equal((await pollRow(poll.id)).voteCount, 1);
    });

    // ── 투표권 = 범위 안 인증 호실 수(11/05, 계획서 12-1)
    const voteRow = (pollId, voterId) => prisma.communityPollVote.findUnique({ where: { pollId_voterId: { pollId, voterId } } });

    test('표 수 = 범위 안 인증 호실 수 — 3호실이면 3표, 만료 · 취소 호실은 빠진다', async () => {
      const { complex, author } = await setup();
      const voter = await createUser();
      for (let i = 0; i < 3; i += 1) await addUnit(voter, complex);
      await addUnit(voter, complex, { expired: true });
      await addUnit(voter, complex, { status: 'REVOKED' });
      const poll = await createPoll(author, REGION, pollInput(complex.id));

      const before = await findPollDetail(voter, poll.id);
      assert.deepEqual([before.myUnitCount, before.myWeight], [3, 3]); // 참여 전에도 "인증한 호실 3개 — 3표"
      await castVote(voter, await pollRow(poll.id), { optionId: poll.options[0].id });

      assert.equal((await voteRow(poll.id, voter.id)).weight, 3);
      const row = await pollRow(poll.id);
      assert.deepEqual([row.voteCount, row.weightTotal], [1, 3]);
      const option = await prisma.communityPollOption.findUnique({ where: { id: poll.options[0].id } });
      assert.deepEqual([option.voteCount, option.weightTotal], [1, 3]);
      assert.equal((await findPollDetail(voter, poll.id)).myWeight, 3);
    });

    test('우리 단지(COMPLEX)는 그 단지 호실만, 법정동(REGION)은 동 안 여러 단지 호실의 합', async () => {
      const { complex, author } = await setup();
      const other = await fixture.createComplex({ name: '같은동다른아파트' }); // 같은 법정동(REGION)
      const voter = await createUser();
      await addUnit(voter, complex);
      await addUnit(voter, complex);
      await addUnit(voter, other);
      const complexPoll = await createPoll(author, REGION, pollInput(complex.id, { scope: 'COMPLEX' }));
      const regionPoll = await createPoll(author, REGION, pollInput(complex.id));
      await castVote(voter, await pollRow(complexPoll.id), { optionId: complexPoll.options[0].id });
      await castVote(voter, await pollRow(regionPoll.id), { optionId: regionPoll.options[0].id });
      assert.equal((await voteRow(complexPoll.id, voter.id)).weight, 2);
      assert.equal((await voteRow(regionPoll.id, voter.id)).weight, 3);
    });

    test('참여 뒤 호실을 팔아도(소유 끝) 이미 던진 표는 그대로', async () => {
      const { complex, author } = await setup();
      const voter = await createUser();
      const sold = await addUnit(voter, complex);
      await addUnit(voter, complex);
      const poll = await createPoll(author, REGION, pollInput(complex.id));
      await castVote(voter, await pollRow(poll.id), { optionId: poll.options[1].id });
      await prisma.ownership.updateMany({ where: { propertyId: sold.id }, data: { endedAt: new Date() } });

      assert.equal((await voteRow(poll.id, voter.id)).weight, 2);
      assert.equal((await pollRow(poll.id)).weightTotal, 2);
      const detail = await findPollDetail(voter, poll.id);
      assert.deepEqual([detail.myUnitCount, detail.myWeight], [1, 2]); // 지금 호실은 1개지만 던진 표는 2표
    });

    test('결과는 표 수 기준 — 참여 인원 · 총 표 수 · 선택지별 표 수 · 비율', async () => {
      const { complex, author } = await setup();
      const big = await createUser();
      for (let i = 0; i < 3; i += 1) await addUnit(big, complex);
      const small = await createUser();
      await addUnit(small, complex);
      const poll = await createPoll(author, REGION, pollInput(complex.id));
      await castVote(big, await pollRow(poll.id), { optionId: poll.options[0].id });
      await castVote(small, await pollRow(poll.id), { optionId: poll.options[1].id });

      const open = await findPollDetail(author, poll.id);
      assert.ok(!('weightTotal' in open)); // 마감 전에는 총 표 수도 주지 않는다
      assert.ok(open.options.every((option) => !('weightTotal' in option)));

      await prisma.communityPoll.update({ where: { id: poll.id }, data: { closesAt: new Date(Date.now() - 1000) } });
      const closed = await findPollDetail(author, poll.id);
      assert.deepEqual([closed.voteCount, closed.weightTotal], [2, 4]);
      assert.deepEqual(closed.options.map((option) => [option.voteCount, option.weightTotal, option.percent]), [[1, 3, 75], [1, 1, 25]]);
    });

    test('투표 행의 표 수는 기본 1(기존 행) · 1 미만은 DB 가 막는다', async () => {
      const { complex, author, voter } = await setup();
      const poll = await createPoll(author, REGION, pollInput(complex.id));
      const row = await prisma.communityPollVote.create({ data: { pollId: poll.id, optionId: poll.options[0].id, voterId: voter.id } });
      assert.equal(row.weight, 1);
      await assert.rejects(prisma.communityPollVote.update({ where: { id: row.id }, data: { weight: 0 } }));
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

    test('수집 대상 = 뉴스를 볼 수 있는 사람이 있는 구 — 인증 전은 들어가고, 인증 취소 · 끝난 소유만 있는 구는 빠진다', async () => {
      // 다른 데이터와 겹치지 않게, 소유 관계가 하나도 없는 시·군·구를 쓴다(먼저 확인)
      const UNVERIFIED_REGION = '4794025000'; // 경북 울릉군 울릉읍 — 인증 전 호실만
      const REVOKED_REGION = '2872031000'; // 인천 옹진군 북도면 — 인증 취소 호실만
      const ENDED_REGION = '4380025000'; // 충북 단양군 단양읍 — 끝난 소유 관계만
      const ownedIn = (sigungu) =>
        prisma.ownership.count({ where: { property: { complex: { regionId: { startsWith: sigungu } } } } });
      for (const code of ['47940', '28720', '43800']) assert.equal(await ownedIn(code), 0, `${code} 에 다른 소유 관계가 있어 이 테스트를 쓸 수 없다`);

      const user = await createUser();
      await addUnit(user, await fixture.createComplex({ name: '울릉인증전아파트', regionId: UNVERIFIED_REGION }), { status: 'UNVERIFIED' });
      await addUnit(user, await fixture.createComplex({ name: '옹진취소아파트', regionId: REVOKED_REGION }), { status: 'REVOKED' });
      const ended = await addUnit(user, await fixture.createComplex({ name: '단양끝난아파트', regionId: ENDED_REGION }));
      await prisma.ownership.updateMany({ where: { propertyId: ended.id }, data: { endedAt: new Date() } });

      const targets = await buildNewsTargets();
      const sigungu = Object.fromEntries(targets.filter((target) => target.scope === 'SIGUNGU').map((target) => [target.scopeCode, target]));
      // 인증 전 호실만 있어도 그 구 · 그 시·도를 모은다 — 그 임대인은 뉴스를 볼 수 있으므로. 검색어에 그 동도 들어간다
      assert.ok(sigungu['47940'], JSON.stringify(Object.keys(sigungu)));
      assert.equal(sigungu['47940'].dongQueryNames.length, 1);
      assert.ok(targets.some((target) => target.scope === 'SIDO' && target.scopeCode === '47'));
      // 인증 취소 · 끝난 소유만 있는 구는 볼 사람이 없어 모으지 않는다
      assert.equal(sigungu['28720'], undefined);
      assert.equal(sigungu['43800'], undefined);
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

    describe('우리 단지', () => {
      const OTHER_REGION = '1171010100'; // 시드에 있는 다른 법정동(서울 송파구 잠실동)
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
      });

      // 이름이 겹치지 않는 단지(흔한 이름 규칙에 걸리지 않게)
      const createNamedComplex = async (label, extra = {}) => {
        return fixture.createComplex({ name: `${label}${runId.slice(0, 8)}아파트`, ...extra });
      };
      // 단지 검색어(따옴표로 묶인 이름)에는 그 이름이 든 기사 둘(하나는 부동산 낱말 없음), 지역 · 전국 검색어에는 빈 응답
      const complexFetch = async (url) => {
        const q = new URL(url).searchParams.get('q');
        const quoted = q.match(/^"([^"]+)"/);
        if (!quoted) return new Response('<rss><channel></channel></rss>', { status: 200 });
        const name = quoted[1];
        const xml = `<rss><channel>${item(`${name} 전세 매물 증가`, `complex-${name}-pass`)}${item(`${name} 가을 음악회`, `complex-${name}-drop`)}</channel></rss>`;
        return new Response(xml, { status: 200 });
      };
      // 단지 후보는 그 테스트가 만든 단지로 좁힌다(complexIds) — 같은 DB 를 쓰는 다른 테스트가 단지를 30곳 넘게 만들어도
      // 이 테스트의 단지가 이번 몫(COMPLEX_MAX_PER_RUN)에서 밀리지 않게. 소유 규칙 · 순서 규칙은 그대로 적용된다.
      const quietCollect = async (complexIds) => {
        const info = console.info;
        console.info = () => {};
        try {
          return await collectAllNews({ fetchImpl: complexFetch, complexIds }); // cron 이 부르는 것(지역 · 전국 → 단지)
        } finally {
          console.info = info;
        }
      };
      const api = (user, pathname) =>
        fetch(`${origin}/api/v1${pathname}`, {
          headers: { ...(user ? { Cookie: `access_token=${signAccessToken(user)}` } : {}), 'X-Requested-With': 'butler-web' },
        });

      test('수집 대상 단지 = 호실 등록 임대인이 있는 단지 — 인증 전은 들어가고, 인증 취소만 있는 단지는 빠진다', async () => {
        const owner = await createUser();
        const unverified = await createNamedComplex('단지뉴스인증전');
        await addUnit(owner, unverified, { status: 'UNVERIFIED' });
        const revoked = await createNamedComplex('단지뉴스취소');
        await addUnit(owner, revoked, { status: 'REVOKED' });

        const result = await quietCollect([unverified.id, revoked.id]);
        const rows = Object.fromEntries(result.results.filter((row) => row.scope === 'COMPLEX').map((row) => [row.scopeCode, row]));
        // 이름 그대로 · "아파트" 뗀 이름 두 검색어, 검색어마다 기사 둘 중 음악회 기사는 걸러진다
        assert.deepEqual(
          { fetched: rows[unverified.id]?.fetched, filtered: rows[unverified.id]?.filtered, inserted: rows[unverified.id]?.inserted },
          { fetched: 4, filtered: 2, inserted: 2 },
        );
        assert.equal(rows[unverified.id].complexName, unverified.name);
        assert.equal(rows[revoked.id], undefined);
        assert.equal(result.complexesLeft, 0);

        const saved = await prisma.communityNewsItem.findMany({ where: { ...testRows, scope: 'COMPLEX', scopeCode: unverified.id }, select: { title: true } });
        assert.equal(saved.length, 2);
        assert.ok(saved.every((row) => row.title.includes('전세')));
        assert.equal(await prisma.communityNewsItem.count({ where: { scope: 'COMPLEX', scopeCode: revoked.id } }), 0);
        // 시도한 단지는 시각이 남고, 대상이 아닌 단지는 남지 않는다
        assert.ok(await prisma.communityNewsCursor.findUnique({ where: { scope_scopeCode: { scope: 'COMPLEX', scopeCode: unverified.id } } }));
        assert.equal(await prisma.communityNewsCursor.findUnique({ where: { scope_scopeCode: { scope: 'COMPLEX', scopeCode: revoked.id } } }), null);
      });

      test('한 번 몫(COMPLEX_MAX_PER_RUN)보다 단지가 많으면 다음 실행에서 남은 단지부터 — 오래 안 모은 단지 차례로 모두 돈다', async () => {
        const owner = await createUser();
        const complexes = [];
        for (let i = 0; i < COMPLEX_MAX_PER_RUN + 2; i += 1) {
          const complex = await createNamedComplex(`단지뉴스차례${String(i).padStart(2, '0')}`);
          await addUnit(owner, complex);
          complexes.push(complex);
        }
        const ids = complexes.map((complex) => complex.id);
        const byId = (a, b) => a.localeCompare(b); // 서비스의 같은 시각 순서(orderComplexesForRun)와 같게
        const emptyFetch = async () => new Response('<rss><channel></channel></rss>', { status: 200 });
        const run = async () => {
          const info = console.info;
          console.info = () => {};
          try {
            const result = await collectComplexNews({ fetchImpl: emptyFetch, complexIds: ids });
            assert.equal(result.complexesLeft, 0);
            return result.results.map((row) => row.scopeCode);
          } finally {
            console.info = info;
          }
        };

        // 1회: 한 번도 안 모은 32곳 중 id 순 30곳 — 2곳은 못 돈다
        const first = await run();
        assert.equal(first.length, COMPLEX_MAX_PER_RUN);
        assert.deepEqual(first, [...ids].sort(byId).slice(0, COMPLEX_MAX_PER_RUN));
        const missed = ids.filter((id) => !first.includes(id)).sort(byId);
        assert.equal(missed.length, 2);
        // 2회: 못 돈 2곳(시각 없음)이 맨 앞, 이어서 1회에 먼저 돈 순서대로(시각이 오래된 순) — 1회 끝 두 곳은 이번엔 빠진다
        const second = await run();
        assert.deepEqual(second, [...missed, ...first.slice(0, COMPLEX_MAX_PER_RUN - 2)]);
        // 두 번 만에 모든 단지가 한 번 이상 시도됐다(기사가 0건이어도 시각이 남는다)
        assert.equal(await prisma.communityNewsCursor.count({ where: { scope: 'COMPLEX', scopeCode: { in: ids } } }), ids.length);
        // 3회: 가장 오래 전에 시도한 단지(1회 끝 두 곳)가 맨 앞 — 같은 30곳만 도는 일이 없다
        const third = await run();
        assert.deepEqual(third.slice(0, 2), first.slice(COMPLEX_MAX_PER_RUN - 2));
      });

      test('지역 · 전국 수집(collectNews)은 단지를 건드리지 않는다 — 단지는 cron(collectAllNews)이 이어서 모은다', async () => {
        const owner = await createUser();
        const complex = await createNamedComplex('단지뉴스지역만');
        await addUnit(owner, complex);
        const info = console.info;
        console.info = () => {};
        try {
          const regional = await collectNews({ fetchImpl: complexFetch });
          assert.ok(regional.results.every((row) => row.scope !== 'COMPLEX'));
          assert.ok(!('complexesLeft' in regional));
        } finally {
          console.info = info;
        }
        assert.equal(await prisma.communityNewsItem.count({ where: { scope: 'COMPLEX', scopeCode: complex.id } }), 0);
        assert.equal(await prisma.communityNewsCursor.findUnique({ where: { scope_scopeCode: { scope: 'COMPLEX', scopeCode: complex.id } } }), null);
      });

      test('대상마다 검색어 이름 · 흔한 이름 판정이 붙는다 — 같은 이름 단지가 둘이면 동 · 구 이름 없는 제목은 탈락', async () => {
        const owner = await createUser();
        const mine = await createNamedComplex('단지뉴스흔한');
        await addUnit(owner, mine);
        // 같은 이름 단지가 다른 동네에 하나 더(호실 없음 — 수집 대상은 아니지만 이름 수에는 든다)
        await fixture.createComplex({ name: mine.name, regionId: OTHER_REGION });

        assert.ok((await listAllOwnedComplexIds()).includes(mine.id));
        const targets = await buildComplexNewsTargets({ complexIds: [mine.id] });
        assert.equal(targets.length, 1);
        const [target] = targets;
        assert.equal(target.scopeCode, mine.id);
        assert.deepEqual(target.complexQueryNames, [mine.name, mine.name.replace(/아파트$/, '')]);
        assert.equal(target.filter(`${mine.name} 전세 매물 증가`), false);
        assert.equal(target.filter(`노원 ${mine.name} 전세 매물 증가`), true);
      });

      test('읽기: 그 단지 동네의 호실 등록자는 인증 전이어도 200, 다른 동네 임대인 · 임차인 403, 없는 단지 404', async () => {
        const complex = await createNamedComplex('단지뉴스읽기');
        const owner = await createUser();
        await addUnit(owner, complex, { status: 'UNVERIFIED' });
        await quietCollect([complex.id]);

        const ok = await api(owner, `/community/complexes/${complex.id}/news?page=1&size=5`);
        assert.equal(ok.status, 200);
        const body = await ok.json();
        assert.equal(body.data.length, 2);
        assert.ok(body.data.every((row) => row.scope === 'COMPLEX' && row.title.includes(complex.name.replace(/아파트$/, ''))));
        assert.deepEqual(body.meta.complex, { id: complex.id, name: complex.name, legalDongCode: REGION });
        assert.equal(body.meta.total, 2);

        // 같은 동네 다른 단지의 호실 등록자도 읽을 수 있다(읽기 자격은 법정동 단위)
        const neighbor = await createUser();
        await addUnit(neighbor, await fixture.createComplex());
        assert.equal((await api(neighbor, `/community/complexes/${complex.id}/news`)).status, 200);

        const elsewhere = await createUser();
        await addUnit(elsewhere, await createNamedComplex('단지뉴스다른동네', { regionId: OTHER_REGION }));
        const denied = await api(elsewhere, `/community/complexes/${complex.id}/news`);
        assert.equal(denied.status, 403);
        assert.equal((await denied.json()).error.code, 'COMMUNITY_REGION_OWNER_REQUIRED');
        const tenant = await createUser('TENANT');
        assert.equal((await api(tenant, `/community/complexes/${complex.id}/news`)).status, 403);

        for (const id of [randomUUID(), 'not-a-uuid']) {
          const missing = await api(owner, `/community/complexes/${id}/news`);
          assert.equal(missing.status, 404);
          assert.equal((await missing.json()).error.code, 'COMMUNITY_COMPLEX_NOT_FOUND');
        }
      });
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

    test('인증 취소(REVOKED)만 있는 임대인은 읽기 403 — 같은 동에 취소 아닌 호실이 하나라도 있으면 통과', async () => {
      const complex = await fixture.createComplex();
      const revoked = await createUser();
      await addUnit(revoked, complex, { status: 'REVOKED' });
      const error = await runOwner(revoked);
      assert.equal(error?.code, 'COMMUNITY_REGION_OWNER_REQUIRED');
      assert.equal(error?.httpStatus, 403);

      await addUnit(revoked, complex, { status: 'UNVERIFIED' });
      assert.equal(await runOwner(revoked), null);
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
        for (const key of ['options', 'hasVoted', 'myOptionId', 'canVote', 'isEligible', 'myUnitCount', 'myWeight', 'weightTotal', 'description', 'authorLabel']) {
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

    test('인증 취소(REVOKED)만 있는 건물은 나오지 않고, 취소 호실은 호실 수 · 인증할 호실(verifyPropertyId)에 들어가지 않는다', async () => {
      const user = await createUser();
      const revokedOnly = await fixture.createComplex({ name: '취소아파트' });
      const mixed = await fixture.createComplex({ name: '섞인취소아파트' });
      for (const complex of [revokedOnly, mixed]) {
        await prisma.myBuilding.create({ data: { userId: user.id, complexId: complex.id, name: complex.name } });
      }
      await addUnit(user, revokedOnly, { status: 'REVOKED' });
      await addUnit(user, mixed, { buildingNo: '101', unitNo: '101', status: 'REVOKED' }); // 자연순으로는 이것이 먼저
      const pending = await addUnit(user, mixed, { buildingNo: '102', unitNo: '101', status: 'UNVERIFIED' });

      const buildings = await findMyBuildings(user);
      assert.deepEqual(buildings.map((b) => b.name), ['섞인취소아파트']);
      assert.equal(buildings[0].unitCount, 1);
      assert.equal(buildings[0].verificationStatus, 'UNVERIFIED');
      assert.equal(buildings[0].verifyPropertyId, pending.id);
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

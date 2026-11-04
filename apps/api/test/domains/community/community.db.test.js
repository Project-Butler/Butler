// 커뮤니티 서비스(실제 로컬 Postgres). RUN_DB_TESTS=1 일 때만 돈다(testSupport/dbTest.js).
// 단지·사용자는 A팀 createDbFixture 로 만들고, 그 정리가 모르는 커뮤니티 행(community_*)은 여기서 지운다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { prisma } from '../../../src/platform/prismaClient.js';
import { requireRegionMember } from '../../../src/domains/community/platformBridge.js';
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

  describe('my-buildings', () => {
    test('미인증·만료 건물은 빠지고, my_buildings 이름을 바꾸면 따라온다', async () => {
      const user = await createUser();
      const ok = await fixture.createComplex({ name: '인증아파트' });
      const pending = await fixture.createComplex({ name: '미인증아파트' });
      const expired = await fixture.createComplex({ name: '만료아파트' });
      for (const complex of [ok, pending, expired]) {
        await prisma.myBuilding.create({ data: { userId: user.id, complexId: complex.id, name: complex.name } });
      }
      await addUnit(user, ok);
      await addUnit(user, ok);
      await addUnit(user, pending, { status: 'UNVERIFIED' });
      await addUnit(user, expired, { expired: true });

      let buildings = await findMyBuildings(user);
      assert.deepEqual(buildings.map((building) => [building.name, building.unitCount]), [['인증아파트', 2]]);

      await prisma.myBuilding.updateMany({ where: { userId: user.id, complexId: ok.id }, data: { name: '바꾼 이름' } });
      buildings = await findMyBuildings(user);
      assert.equal(buildings[0].name, '바꾼 이름');
      assert.equal(buildings[0].regionName, '서울특별시 노원구 중계동');
    });

    test('unitAreas 는 인증 호실의 전용면적만 담는다(만료 · 미인증 · 면적 없는 호실은 빠짐, 동 · 호수 없음)', async () => {
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
      assert.equal(building.unitCount, 3);
      assert.deepEqual([...building.unitAreas].sort((a, b) => a - b), [59.84, 84.97]);
      assert.ok(building.unitAreas.every((area) => typeof area === 'number'));
      assert.deepEqual(Object.keys(building).sort(), [
        'complexId', 'legalDongCode', 'memberCount', 'name', 'regionName', 'unitAreas', 'unitCount',
      ]);
    });
  });
});

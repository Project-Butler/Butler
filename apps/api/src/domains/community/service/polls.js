// 투표 (목록 · 상세 · 만들기). 투표권 = 범위 안 인증 호실 수(11/05 "보유 수로", 계획서 12-1):
// 한 사람은 한 번만 참여하고(DB 유니크 @@unique pollId+voterId) 가진 표(weight)를 한 선택지에 모두 던진다.
// 참여 인원은 voteCount, 표 수 합은 weightTotal(투표 · 선택지 모두). 마감 전에는 선택지별 득표 · 총 표 수를 응답에 넣지 않는다.
import { AppError } from '../../../platform/AppError.js';
import { prisma } from '../../../platform/prismaClient.js';
import { countMyVerifiedUnitsInScope, isComplexMember, isRegionMember } from '../platformBridge.js';
import { buildAuthorLabel, findRegion, getWriteAccess, isUniqueViolation, VISIBLE } from '../service.js';
import { assertHasNickname, loadNicknames, nicknameOf } from './nicknames.js';

export const throwPollNotFound = () => {
  throw new AppError('COMMUNITY_POLL_NOT_FOUND', 404, '투표를 찾을 수 없습니다.');
};

// 마감 판정. 마감 배치(cron)가 closedAt 을 채우기 전에도 closesAt 이 지났으면 마감으로 본다.
export const isPollClosed = (poll, now = new Date()) =>
  poll.closedAt !== null || poll.closesAt.getTime() <= now.getTime();

const openWhere = (now) => ({ closedAt: null, closesAt: { gt: now } });
const closedWhere = (now) => ({ OR: [{ closedAt: { not: null } }, { closesAt: { lte: now } }] });

// 범위 필터. complexId 는 화면의 현재 건물 — "우리 단지"는 그 단지의 COMPLEX 투표다.
// 전체(scope 없음)는 법정동 투표 + (complexId 가 있으면) 그 단지 투표, 없으면 법정동 안 모든 투표.
const scopeWhere = (scope, complexId) => {
  if (scope === 'REGION') return { scope: 'REGION' };
  if (scope === 'COMPLEX') return { scope: 'COMPLEX', ...(complexId ? { complexId } : {}) };
  return complexId ? { OR: [{ scope: 'REGION' }, { scope: 'COMPLEX', complexId }] } : {};
};

const toPollListItem = (poll, votedPollIds, now) => ({
  id: poll.id,
  scope: poll.scope,
  complexId: poll.complexId,
  title: poll.title,
  closesAt: poll.closesAt.toISOString(),
  isClosed: isPollClosed(poll, now),
  voteCount: poll.voteCount,
  hasVoted: votedPollIds.has(poll.id),
});

// GET /community/regions/:legalDongCode/polls — 진행중은 마감 임박순, 마감은 최근 마감순.
export const findPolls = async (user, legalDongCode, { scope, status, complexId, page, size }) => {
  const region = await findRegion(legalDongCode);
  const now = new Date();
  const where = {
    legalDongCode,
    ...VISIBLE,
    AND: [status === 'CLOSED' ? closedWhere(now) : openWhere(now), scopeWhere(scope, complexId)],
  };
  const orderBy = status === 'CLOSED' ? [{ closesAt: 'desc' }, { id: 'desc' }] : [{ closesAt: 'asc' }, { id: 'asc' }];
  const [polls, total, access] = await Promise.all([
    prisma.communityPoll.findMany({ where, orderBy, skip: (page - 1) * size, take: size }),
    prisma.communityPoll.count({ where }),
    getWriteAccess(user, legalDongCode),
  ]);
  const votes = await prisma.communityPollVote.findMany({
    where: { voterId: user.id, pollId: { in: polls.map((poll) => poll.id) } },
    select: { pollId: true },
  });
  const votedPollIds = new Set(votes.map((vote) => vote.pollId));

  return {
    items: polls.map((poll) => toPollListItem(poll, votedPollIds, now)),
    meta: { page, size, total, hasNext: page * size < total, region, ...access },
  };
};

export const findVisiblePoll = async (pollId) => {
  const poll = await prisma.communityPoll.findFirst({ where: { id: pollId, ...VISIBLE } });
  if (!poll) throwPollNotFound();
  return poll;
};

// 참여 자격: 임대인이고, COMPLEX 면 그 단지·REGION 이면 그 법정동에 유효 인증.
const isEligibleVoter = async (user, poll) => {
  if (user.role !== 'LANDLORD') return false;
  return poll.scope === 'COMPLEX'
    ? isComplexMember(user.id, poll.complexId)
    : isRegionMember(user.id, poll.legalDongCode);
};

// 득표 비율(%)은 표 수 기준 반올림한 정수. 표가 없으면 0.
const toPercent = (count, total) => (total === 0 ? 0 : Math.round((count * 100) / total));

const scopeOf = (poll) => (poll.scope === 'COMPLEX' ? { complexId: poll.complexId } : { legalDongCode: poll.legalDongCode });

// GET /community/polls/:pollId
// 그 법정동에 인증이 유효하지 않으면(미리보기) 질문 · 범위 · 마감 · 참여 인원만 주고 locked: true.
// 선택지 · 내 참여 여부 · 득표 · 비율은 응답에 넣지 않는다(서버가 잠근다).
export const findPollDetail = async (user, pollId) => {
  const poll = await findVisiblePoll(pollId);
  const now = new Date();
  const isClosed = isPollClosed(poll, now);
  const access = await getWriteAccess(user, poll.legalDongCode);
  if (!access.canWrite) {
    const [region, complex] = await Promise.all([
      findRegion(poll.legalDongCode),
      poll.complexId ? prisma.complex.findUnique({ where: { id: poll.complexId }, select: { name: true } }) : null,
    ]);
    return {
      id: poll.id,
      scope: poll.scope,
      complexId: poll.complexId,
      complexName: complex?.name ?? null,
      region,
      title: poll.title,
      closesAt: poll.closesAt.toISOString(),
      isClosed,
      voteCount: poll.voteCount,
      ...access,
      locked: true,
      createdAt: poll.createdAt.toISOString(),
    };
  }
  const [options, myVote, region, complex, isEligible, myUnitCount, nicknames] = await Promise.all([
    prisma.communityPollOption.findMany({ where: { pollId }, orderBy: { position: 'asc' } }),
    prisma.communityPollVote.findUnique({ where: { pollId_voterId: { pollId, voterId: user.id } } }),
    findRegion(poll.legalDongCode),
    poll.complexId ? prisma.complex.findUnique({ where: { id: poll.complexId }, select: { name: true } }) : null,
    isEligibleVoter(user, poll),
    countMyVerifiedUnitsInScope(user.id, scopeOf(poll)),
    loadNicknames([poll.authorId]),
  ]);

  return {
    id: poll.id,
    scope: poll.scope,
    complexId: poll.complexId,
    complexName: complex?.name ?? null,
    region,
    title: poll.title,
    description: poll.description,
    // 작성자: 지금 닉네임(없으면 null) + 만들 때 굳힌 표기
    authorNickname: nicknameOf(nicknames, poll.authorId),
    authorLabel: poll.authorLabel,
    isMine: poll.authorId === user.id,
    closesAt: poll.closesAt.toISOString(),
    isClosed,
    voteCount: poll.voteCount,
    hasVoted: Boolean(myVote),
    myOptionId: myVote?.optionId ?? null,
    isEligible,
    canVote: !isClosed && !myVote && isEligible,
    // 지금 범위 안 인증 호실 수("인증한 호실 N개 — N표")
    myUnitCount,
    // 내 표 수: 참여했으면 그때 굳힌 표 수, 아니면 지금 참여하면 반영될 표 수
    myWeight: myVote ? myVote.weight : myUnitCount,
    // 머리말 배지용 — 보는 사람의 이 법정동 자격(게시판과 같음)
    ...access,
    locked: false,
    // 결과(마감 뒤에만): 총 표 수, 선택지별 참여 인원 · 표 수 · 비율(표 수 기준)
    ...(isClosed ? { weightTotal: poll.weightTotal } : {}),
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      position: option.position,
      ...(isClosed
        ? { voteCount: option.voteCount, weightTotal: option.weightTotal, percent: toPercent(option.weightTotal, poll.weightTotal) }
        : {}),
    })),
    createdAt: poll.createdAt.toISOString(),
  };
};

// POST /community/regions/:legalDongCode/polls — 범위는 여기서 정하면 바꿀 수 없다(수정 경로 없음).
// complexId 는 화면의 현재 건물: 작성자 표기에 쓰고, COMPLEX 투표면 그 단지가 투표 대상이다.
// 닉네임이 없으면 403 COMMUNITY_NICKNAME_REQUIRED.
export const createPoll = async (user, legalDongCode, { scope, complexId, title, description, options, closesAt }) => {
  await assertHasNickname(user.id);
  const authorLabel = await buildAuthorLabel(user, legalDongCode, complexId);
  const poll = await prisma.communityPoll.create({
    data: {
      scope,
      legalDongCode,
      complexId: scope === 'COMPLEX' ? complexId : null,
      title,
      description,
      authorId: user.id,
      authorLabel,
      closesAt,
      options: { create: options.map((label, index) => ({ label, position: index + 1 })) },
    },
  });
  return findPollDetail(user, poll.id);
};

// POST /community/polls/:pollId/votes — 한 사람 한 번, 가진 표를 한 선택지에 모두.
// 표 수 계산 · 투표 행(weight 굳히기) · 집계(참여 인원 +1, 표 수 합 +weight)를 같은 트랜잭션에서.
export const castVote = async (user, poll, { optionId }) => {
  if (isPollClosed(poll)) throw new AppError('COMMUNITY_POLL_CLOSED', 409, '마감된 투표입니다.');
  if (!(await isEligibleVoter(user, poll))) {
    throw new AppError('COMMUNITY_POLL_NOT_ELIGIBLE', 403, '이 투표에 참여할 수 있는 임대인이 아닙니다.');
  }
  const option = await prisma.communityPollOption.findFirst({ where: { id: optionId, pollId: poll.id }, select: { id: true } });
  if (!option) {
    throw new AppError('VALIDATION_ERROR', 400, '요청 값이 올바르지 않습니다.', [
      { field: 'optionId', reason: '이 투표의 선택지가 아닙니다.' },
    ]);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const weight = await countMyVerifiedUnitsInScope(user.id, scopeOf(poll), tx);
      // 자격 검사와 이 사이에 인증이 만료 · 취소됐으면 표가 0 — 참여시키지 않는다
      if (weight < 1) throw new AppError('COMMUNITY_POLL_NOT_ELIGIBLE', 403, '이 투표에 참여할 수 있는 임대인이 아닙니다.');
      await tx.communityPollVote.create({ data: { pollId: poll.id, optionId, voterId: user.id, weight } });
      await tx.communityPollOption.update({
        where: { id: optionId },
        data: { voteCount: { increment: 1 }, weightTotal: { increment: weight } },
      });
      await tx.communityPoll.update({ where: { id: poll.id }, data: { voteCount: { increment: 1 }, weightTotal: { increment: weight } } });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('COMMUNITY_ALREADY_VOTED', 409, '이미 참여한 투표입니다.');
    throw error;
  }
  return findPollDetail(user, poll.id);
};

// DELETE /community/polls/:pollId — 등록자 본인, 참여자가 0명일 때만, 표시만(deletedAt). 법정동 자격은 보지 않는다(글 삭제와 같음).
// 한 명이라도 참여했으면 지울 수 없다 — 던진 표가 사라지면 안 된다.
export const deletePoll = async (user, poll) => {
  if (poll.authorId !== user.id) {
    throw new AppError('COMMUNITY_NOT_AUTHOR', 403, '본인이 등록한 투표만 지울 수 있습니다.');
  }
  // 참여와 동시에 지우는 경쟁을 막으려고 voteCount 가 0 일 때만 고친다.
  const { count } = await prisma.communityPoll.updateMany({
    where: { id: poll.id, voteCount: 0, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count === 0) throw new AppError('COMMUNITY_POLL_HAS_VOTES', 409, '참여한 사람이 있는 투표는 지울 수 없습니다.');
};

// GET /api/cron/community-polls — closesAt 이 지난 투표의 closedAt 을 채운다(색인·정렬용, 마감 판정은 읽을 때도 한다).
// closedAt 은 실제 마감 시각(closesAt)으로 채운다 — 배치가 늦게 돌아도 마감 시각이 흔들리지 않게.
export const closeExpiredPolls = async () => {
  const closed = await prisma.$executeRaw`
    UPDATE community_polls SET closed_at = closes_at, updated_at = now()
    WHERE closed_at IS NULL AND closes_at <= now()`;
  return { closed };
};

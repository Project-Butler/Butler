// 운영자 API. 화면은 A팀 운영자 콘솔이 만든다 — 여기는 /community/admin/... 경로만.
// 숨김(운영자)과 삭제(작성자)는 따로 저장한다: hiddenAt·hiddenByUserId / deletedAt.
// 누가 언제 숨겼는지는 그 두 칸에만 남는다(플랫폼 감사 기록 함수가 아직 없다 — 해제하면 지워진다).
import { AppError } from '../../../platform/AppError.js';
import { prisma } from '../../../platform/prismaClient.js';

const throwNotFound = (code, message) => {
  throw new AppError(code, 404, message);
};

// 신고 대상 요약. 운영자가 판단할 수 있게 작성자 id 와 숨김·삭제 상태까지 준다(운영자 전용 응답).
const toReportTarget = (report) => {
  if (report.post) {
    return {
      type: 'POST',
      id: report.post.id,
      legalDongCode: report.post.legalDongCode,
      title: report.post.title,
      authorId: report.post.authorId,
      authorLabel: report.post.authorLabel,
      hiddenAt: report.post.hiddenAt?.toISOString() ?? null,
      deletedAt: report.post.deletedAt?.toISOString() ?? null,
    };
  }
  return {
    type: 'COMMENT',
    id: report.comment.id,
    postId: report.comment.postId,
    body: report.comment.body,
    authorId: report.comment.authorId,
    authorLabel: report.comment.authorLabel,
    hiddenAt: report.comment.hiddenAt?.toISOString() ?? null,
    deletedAt: report.comment.deletedAt?.toISOString() ?? null,
  };
};

const toReport = (report) => ({
  id: report.id,
  reason: report.reason,
  detail: report.detail,
  status: report.status,
  reporterId: report.reporterId,
  handledAt: report.handledAt?.toISOString() ?? null,
  handledByUserId: report.handledByUserId,
  createdAt: report.createdAt.toISOString(),
  target: toReportTarget(report),
});

const REPORT_INCLUDE = {
  post: {
    select: { id: true, legalDongCode: true, title: true, authorId: true, authorLabel: true, hiddenAt: true, deletedAt: true },
  },
  comment: {
    select: { id: true, postId: true, body: true, authorId: true, authorLabel: true, hiddenAt: true, deletedAt: true },
  },
};

// GET /community/admin/reports — 상태·사유로 거르고 접수순(오래된 것 먼저, @@index status+createdAt)
export const findReports = async ({ status, reason, page, size }) => {
  const where = { ...(status ? { status } : {}), ...(reason ? { reason } : {}) };
  const [reports, total] = await Promise.all([
    prisma.communityReport.findMany({
      where,
      include: REPORT_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.communityReport.count({ where }),
  ]);
  return { items: reports.map(toReport), meta: { page, size, total, hasNext: page * size < total } };
};

// PATCH /community/admin/reports/:reportId — 처리하면(RESOLVED·DISMISSED) 누가 언제 처리했는지 남기고,
// 접수(RECEIVED)로 되돌리면 비운다.
export const updateReportStatus = async (admin, reportId, status) => {
  const exists = await prisma.communityReport.findUnique({ where: { id: reportId }, select: { id: true } });
  if (!exists) throwNotFound('COMMUNITY_REPORT_NOT_FOUND', '신고를 찾을 수 없습니다.');
  const handled = status === 'RECEIVED' ? { handledAt: null, handledByUserId: null } : { handledAt: new Date(), handledByUserId: admin.id };
  const report = await prisma.communityReport.update({
    where: { id: reportId },
    data: { status, ...handled },
    include: REPORT_INCLUDE,
  });
  return toReport(report);
};

const toHiddenState = (row) => ({
  id: row.id,
  hiddenAt: row.hiddenAt?.toISOString() ?? null,
  hiddenByUserId: row.hiddenByUserId,
});

const hiddenData = (admin, hidden) =>
  hidden ? { hiddenAt: new Date(), hiddenByUserId: admin.id } : { hiddenAt: null, hiddenByUserId: null };

// PATCH /community/admin/posts/:postId/hidden — 숨긴 글은 목록·상세에서 빠진다(VISIBLE 조건).
// 이미 숨긴 글을 다시 숨기면 처음 숨긴 시각·사람을 그대로 둔다.
export const setPostHidden = async (admin, postId, hidden) => {
  const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, hiddenAt: true } });
  if (!post) throwNotFound('COMMUNITY_POST_NOT_FOUND', '글을 찾을 수 없습니다.');
  if (Boolean(post.hiddenAt) === hidden) {
    return toHiddenState(await prisma.communityPost.findUnique({ where: { id: postId } }));
  }
  return toHiddenState(await prisma.communityPost.update({ where: { id: postId }, data: hiddenData(admin, hidden) }));
};

// PATCH /community/admin/comments/:commentId/hidden — 글의 commentCount 는 "보이는 댓글 수"라
// 숨기면 내리고 해제하면 올린다(작성자가 지운 댓글은 이미 빠져 있으니 건드리지 않는다).
// 두 운영자가 동시에 눌러도 한 번만 세도록 상태가 바뀔 때만 고친다.
export const setCommentHidden = async (admin, commentId, hidden) => {
  const comment = await prisma.communityComment.findUnique({ where: { id: commentId }, select: { id: true, postId: true } });
  if (!comment) throwNotFound('COMMUNITY_COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.communityComment.updateMany({
      where: { id: commentId, hiddenAt: hidden ? null : { not: null } },
      data: hiddenData(admin, hidden),
    });
    const countsAsVisible = await tx.communityComment.count({ where: { id: commentId, deletedAt: null } });
    if (count === 1 && countsAsVisible === 1) {
      await tx.communityPost.update({
        where: { id: comment.postId },
        data: { commentCount: hidden ? { decrement: 1 } : { increment: 1 } },
      });
    }
  });
  return toHiddenState(await prisma.communityComment.findUnique({ where: { id: commentId } }));
};

// PATCH /community/admin/polls/:pollId/hidden — 숨긴 투표는 목록·상세에서 빠진다.
export const setPollHidden = async (admin, pollId, hidden) => {
  const poll = await prisma.communityPoll.findUnique({ where: { id: pollId }, select: { id: true, hiddenAt: true } });
  if (!poll) throwNotFound('COMMUNITY_POLL_NOT_FOUND', '투표를 찾을 수 없습니다.');
  if (Boolean(poll.hiddenAt) === hidden) {
    return toHiddenState(await prisma.communityPoll.findUnique({ where: { id: pollId } }));
  }
  return toHiddenState(await prisma.communityPoll.update({ where: { id: pollId }, data: hiddenData(admin, hidden) }));
};

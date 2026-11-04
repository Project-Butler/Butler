// 임대인 커뮤니티(법정동 단위 게시판·투표·뉴스). 인증·소유 관계 판단은 platformBridge.js에서만 가져온다.
import { Prisma } from '@prisma/client';
import { AppError } from '../../platform/AppError.js';
import { compareNatural } from '../../platform/naturalSort.js';
import { prisma } from '../../platform/prismaClient.js';
import {
  countRegionMembers,
  findAuthorUnit,
  getRegionVerificationStatus,
  summarizeMyActiveUnitsByComplex,
} from './platformBridge.js';

// GET /community/my-buildings — 건물 선택 화면 · 건물 바꾸기의 입력.
// 내 건물 설정(my_buildings, 숨기지 않은 것) 중 활성 소유 관계가 있는 단지 — 인증 전 · 만료 건물도 넣는다(미리보기).
// 건물명은 A팀 my_buildings.name을 그대로 쓴다(임대인이 고친 이름이 커뮤니티에도 따라온다).
// unitCount · unitAreas: 이 단지 내 활성 호실 기준(인증 여부는 verificationStatus 가 말한다). 면적 없는 호실은 빠지고,
// 동 · 호수는 넣지 않는다(이름 · 호수 · 연락처는 어디에도 노출하지 않는다).
// verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'EXPIRED', verifyPropertyId: 인증이 필요하면 인증할 호실 하나(권리자 인증 화면으로 가는 id).
// 정렬: 인증된 건물 먼저, 그다음 호실 수 · 건물명.
export const findMyBuildings = async (user) => {
  const myUnits = await summarizeMyActiveUnitsByComplex(user.id);
  if (myUnits.size === 0) return [];

  const buildings = await prisma.myBuilding.findMany({
    where: { userId: user.id, deletedAt: null, complexId: { in: [...myUnits.keys()] } },
    select: {
      name: true,
      complexId: true,
      complex: { select: { regionId: true, region: { select: { fullName: true } } } },
    },
  });

  const memberCounts = await countRegionMembers([...new Set(buildings.map((b) => b.complex.regionId))]);

  return buildings
    .map((building) => ({
      complexId: building.complexId,
      name: building.name,
      legalDongCode: building.complex.regionId,
      regionName: building.complex.region.fullName,
      unitCount: myUnits.get(building.complexId).unitCount,
      unitAreas: myUnits.get(building.complexId).unitAreas,
      memberCount: memberCounts.get(building.complex.regionId) ?? 0,
      verificationStatus: myUnits.get(building.complexId).verificationStatus,
      verifyPropertyId: myUnits.get(building.complexId).verifyPropertyId,
    }))
    .sort(
      (a, b) =>
        Number(b.verificationStatus === 'VERIFIED') - Number(a.verificationStatus === 'VERIFIED') ||
        b.unitCount - a.unitCount ||
        compareNatural(a.name, b.name),
    );
};

// ===== 게시판 (목록 · 글 상세) =====
// 삭제(deletedAt)·운영자 숨김(hiddenAt)된 글·댓글은 목록과 상세에서 빼고, 삭제된 글의 상세는 404다.
// 응답에 작성자 id·이름·호수를 넣지 않는다 — 작성자는 authorLabel 과 내 글인지(isMine)로만 나타낸다(이름 · 호수 · 연락처는 노출하지 않는다).

export const VISIBLE = { deletedAt: null, hiddenAt: null };

export const throwPostNotFound = () => {
  throw new AppError('COMMUNITY_POST_NOT_FOUND', 404, '글을 찾을 수 없습니다.');
};

export const throwCommentNotFound = () => {
  throw new AppError('COMMUNITY_COMMENT_NOT_FOUND', 404, '댓글을 찾을 수 없습니다.');
};

const throwNotAuthor = () => {
  throw new AppError('COMMUNITY_NOT_AUTHOR', 403, '본인이 쓴 글만 고치거나 지울 수 있습니다.');
};

export const isUniqueViolation = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

// 법정동 정보(안내 띠의 "잠실동"). 없는 코드는 404. 응답 키는 legalDongCode 그대로(Region 의 칸 이름은 id).
export const findRegion = async (legalDongCode) => {
  const region = await prisma.region.findUnique({
    where: { id: legalDongCode },
    select: { id: true, dongName: true, fullName: true },
  });
  if (!region) throw new AppError('COMMUNITY_REGION_NOT_FOUND', 404, '지역을 찾을 수 없습니다.');
  return { legalDongCode: region.id, dongName: region.dongName, fullName: region.fullName };
};

// 글쓰기·댓글·투표 자격. 화면이 글쓰기 버튼과 안내 띠를 바꾸는 데 쓴다.
// writeBlockedReason: 쓸 수 있으면 null, 인증이 만료됐으면 'EXPIRED'(화면의 "인증 만료" 띠), 그 밖은 'UNVERIFIED'.
// 임대인이 아니면(임차인 등) 인증을 받을 수 없으니 'UNVERIFIED'.
export const getWriteAccess = async (user, legalDongCode) => {
  const status = user.role === 'LANDLORD' ? await getRegionVerificationStatus(user.id, legalDongCode) : 'UNVERIFIED';
  return { canWrite: status === 'VERIFIED', writeBlockedReason: status === 'VERIFIED' ? null : status };
};

// "{Complex.name} {동}동 임대인". 작성 시점에 굳혀 저장한다(호실을 팔아도 과거 글 표기는 그대로).
// 동이 없는 건물은 "{Complex.name} 임대인", '가동'처럼 이미 '동'으로 끝나는 동 이름에는 '동'을 붙이지 않는다.
const toAuthorLabel = ({ complexName, buildingNo }) => {
  if (!buildingNo) return `${complexName} 임대인`;
  return `${complexName} ${buildingNo.endsWith('동') ? buildingNo : `${buildingNo}동`} 임대인`;
};

// complexId: 화면의 현재 건물. 그 법정동에서 인증받은 단지여야 한다.
export const buildAuthorLabel = async (user, legalDongCode, complexId) => {
  const unit = await findAuthorUnit(user.id, legalDongCode, complexId);
  if (!unit) {
    throw new AppError('COMMUNITY_AUTHOR_COMPLEX_INVALID', 422, '이 지역에서 인증받은 건물이 아닙니다.', [
      { field: 'complexId', reason: '이 법정동에서 권리자 인증을 마친 단지여야 합니다.' },
    ]);
  }
  return toAuthorLabel(unit);
};

const toPostListItem = (post, user) => ({
  id: post.id,
  category: post.category,
  title: post.title,
  authorLabel: post.authorLabel,
  commentCount: post.commentCount,
  isMine: post.authorId === user.id,
  createdAt: post.createdAt.toISOString(),
});

const toComment = (comment, user) => ({
  id: comment.id,
  body: comment.body,
  authorLabel: comment.authorLabel,
  isMine: comment.authorId === user.id,
  createdAt: comment.createdAt.toISOString(),
});

// GET /community/regions/:legalDongCode/posts — 최신순. meta 에 법정동 이름과 글쓰기 자격을 같이 싣는다.
export const findPosts = async (user, legalDongCode, { category, mine, page, size }) => {
  const region = await findRegion(legalDongCode);
  const where = {
    legalDongCode,
    ...VISIBLE,
    ...(category ? { category } : {}),
    ...(mine ? { authorId: user.id } : {}),
  };
  const [posts, total, access] = await Promise.all([
    prisma.communityPost.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.communityPost.count({ where }),
    getWriteAccess(user, legalDongCode),
  ]);

  return {
    items: posts.map((post) => toPostListItem(post, user)),
    meta: { page, size, total, hasNext: page * size < total, region, ...access },
  };
};

// 상세·수정·삭제·댓글·신고가 먼저 글을 찾는다. 삭제·숨김이면 없는 것으로 본다.
export const findVisiblePost = async (postId) => {
  const post = await prisma.communityPost.findFirst({ where: { id: postId, ...VISIBLE } });
  if (!post) throwPostNotFound();
  return post;
};

// GET /community/posts/:postId — 댓글은 오래된 순.
// 그 법정동에 인증이 유효하지 않으면(미인증 · 만료 — 미리보기) 목록에 보이는 것만 주고 locked: true.
// 본문(body)과 댓글(comments)은 응답에 넣지 않는다 — 화면에서 숨기는 것이 아니라 서버가 잠근다.
export const findPostDetail = async (user, postId) => {
  const post = await findVisiblePost(postId);
  const access = await getWriteAccess(user, post.legalDongCode);
  const summary = { ...toPostListItem(post, user), legalDongCode: post.legalDongCode, ...access };
  if (!access.canWrite) return { ...summary, locked: true };

  const comments = await prisma.communityComment.findMany({
    where: { postId, ...VISIBLE },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return {
    ...summary,
    locked: false,
    body: post.body,
    updatedAt: post.updatedAt.toISOString(),
    comments: comments.map((comment) => toComment(comment, user)),
  };
};

// POST /community/regions/:legalDongCode/posts
export const createPost = async (user, legalDongCode, { complexId, category, title, body }) => {
  const authorLabel = await buildAuthorLabel(user, legalDongCode, complexId);
  const post = await prisma.communityPost.create({
    data: { legalDongCode, category, title, body, authorId: user.id, authorLabel },
  });
  return findPostDetail(user, post.id);
};

// PATCH /community/posts/:postId — 본인 글만. 작성자 표기는 바꾸지 않는다.
export const updatePost = async (user, post, fields) => {
  if (post.authorId !== user.id) throwNotAuthor();
  await prisma.communityPost.update({ where: { id: post.id }, data: fields });
  return findPostDetail(user, post.id);
};

// DELETE /community/posts/:postId — 본인 글만, 표시만(deletedAt). 법정동 자격은 보지 않는다(인증이 만료된
// 사람도 자기 글은 지울 수 있어야 한다).
export const deletePost = async (user, post) => {
  if (post.authorId !== user.id) throwNotAuthor();
  await prisma.communityPost.update({ where: { id: post.id }, data: { deletedAt: new Date() } });
};

// POST /community/posts/:postId/comments — 글의 commentCount 를 같은 트랜잭션에서 올린다.
export const createComment = async (user, post, { complexId, body }) => {
  const authorLabel = await buildAuthorLabel(user, post.legalDongCode, complexId);
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.communityComment.create({
      data: { postId: post.id, body, authorId: user.id, authorLabel },
    });
    await tx.communityPost.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } });
    return created;
  });
  return toComment(comment, user);
};

// 댓글 삭제가 먼저 찾는다. 댓글이나 그 글이 삭제·숨김이면 없는 것으로 본다.
export const findVisibleComment = async (commentId) => {
  const comment = await prisma.communityComment.findFirst({
    where: { id: commentId, ...VISIBLE, post: VISIBLE },
    include: { post: { select: { legalDongCode: true } } },
  });
  if (!comment) throwCommentNotFound();
  return comment;
};

// DELETE /community/comments/:commentId — 본인 댓글만, 표시만. commentCount 를 같이 내린다. 자격은 보지 않는다(글 삭제와 같음).
// 동시에 두 번 지워도 한 번만 내리도록 deletedAt 이 비어 있을 때만 고친다.
export const deleteComment = async (user, comment) => {
  if (comment.authorId !== user.id) {
    throw new AppError('COMMUNITY_NOT_AUTHOR', 403, '본인이 쓴 댓글만 지울 수 있습니다.');
  }
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.communityComment.updateMany({
      where: { id: comment.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 1) {
      await tx.communityPost.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } });
    }
  });
};

// POST /community/posts/:postId/reports — 1인 1건(@@unique postId+reporterId). 내 글은 신고할 수 없다.
export const createPostReport = async (user, post, { reason, detail }) => {
  if (post.authorId === user.id) {
    throw new AppError('COMMUNITY_CANNOT_REPORT_OWN_POST', 422, '내 글은 신고할 수 없습니다.');
  }
  try {
    const report = await prisma.communityReport.create({
      data: { postId: post.id, reporterId: user.id, reason, detail },
    });
    return { id: report.id, reason: report.reason, status: report.status, createdAt: report.createdAt.toISOString() };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('COMMUNITY_ALREADY_REPORTED', 409, '이미 신고한 글입니다.');
    }
    throw error;
  }
};

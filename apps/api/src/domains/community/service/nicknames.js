// 작성자 닉네임 붙이기 · 쓰기 전 닉네임 확인. 글 · 댓글 · 투표 · 운영자 응답이 쓴다(계획서 12-3).
// 닉네임은 글에 굳히지 않고 읽을 때 붙인다 — 바꾸면 옛 글도 새 닉네임. 목록은 작성자를 모아 한 번에 묻는다.
// 이 파일은 service.js 를 가져오지 않는다(service.js · polls.js · admin.js 가 이 파일을 가져온다).
import { AppError } from '../../../platform/AppError.js';
import { prisma } from '../../../platform/prismaClient.js';

// 작성자 id 들 → Map(userId → 닉네임). 닉네임이 없는 사람은 Map 에 없다(응답은 null).
export const loadNicknames = async (userIds) => {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.communityProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, nickname: true } });
  return new Map(rows.map((row) => [row.userId, row.nickname]));
};

export const nicknameOf = (nicknames, userId) => nicknames.get(userId) ?? null;

// 글 · 댓글 · 투표 만들기 전에. 닉네임이 없으면 403 COMMUNITY_NICKNAME_REQUIRED — 화면은 이 에러를 보면 닉네임 대화상자를 먼저 띄운다.
export const assertHasNickname = async (userId) => {
  const profile = await prisma.communityProfile.findUnique({ where: { userId }, select: { userId: true } });
  if (!profile) {
    throw new AppError('COMMUNITY_NICKNAME_REQUIRED', 403, '커뮤니티 닉네임을 먼저 정해 주세요.');
  }
};

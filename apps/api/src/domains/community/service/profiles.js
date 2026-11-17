// 내 커뮤니티 닉네임 보기 · 정하기/바꾸기(GET · PUT /community/me/profile). 규칙은 nicknameRules.js.
// 할 수 있는 사람은 커뮤니티를 읽을 수 있는 임대인(인증 전 포함 — 라우터의 requireAnyRegionOwner).
import { AppError } from '../../../platform/AppError.js';
import { prisma } from '../../../platform/prismaClient.js';
import {
  checkNickname,
  cleanNickname,
  NICKNAME_CHANGE_INTERVAL_DAYS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  nextNicknameChangeAt,
  toNicknameKey,
} from '../nicknameRules.js';
import { findPreviewAuthorUnit } from '../platformBridge.js';
import { isUniqueViolation, toAuthorLabel } from '../service.js';

const KST_DATE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });

// { nickname, nextChangeAt, previewLabel }
//   nextChangeAt: 지금 바꿀 수 없으면 바꿀 수 있게 되는 때(ISO), 바꿀 수 있으면 null
//   previewLabel: 대화상자 미리보기 줄의 괄호 속 — complexId(지금 고른 건물)에서 글을 쓰면 붙을 표기. 그 단지에 내 호실이 없으면 null
const toProfile = async (user, profile, complexId, now) => {
  const next = nextNicknameChangeAt(profile?.nicknameChangedAt ?? null);
  const unit = complexId ? await findPreviewAuthorUnit(user.id, complexId) : null;
  return {
    nickname: profile?.nickname ?? null,
    nextChangeAt: next && next > now ? next.toISOString() : null,
    previewLabel: unit ? toAuthorLabel(unit) : null,
  };
};

// GET /community/me/profile?complexId=
export const findMyProfile = async (user, { complexId }, now = new Date()) => {
  const profile = await prisma.communityProfile.findUnique({ where: { userId: user.id } });
  return toProfile(user, profile, complexId, now);
};

const invalid = (code, message, reason) => new AppError(code, 400, message, [{ field: 'nickname', reason }]);

const takenError = () =>
  new AppError('COMMUNITY_NICKNAME_TAKEN', 409, '이미 쓰는 닉네임입니다.', [
    { field: 'nickname', reason: '영문 대소문자와 띄어쓰기만 다른 닉네임도 같은 닉네임으로 봅니다.' },
  ]);

const tooSoonError = (next) =>
  new AppError('COMMUNITY_NICKNAME_CHANGE_TOO_SOON', 409, `${KST_DATE.format(next)}부터 바꿀 수 있습니다.`, [
    { field: 'nickname', reason: `닉네임은 ${NICKNAME_CHANGE_INTERVAL_DAYS}일에 한 번 바꿀 수 있습니다.` },
  ]);

// 어느 유일 제약에 걸렸는가 — 닉네임 키면 다른 사람이 쓰는 닉네임, user_id 면 같은 사람이 동시에 처음 정하기를 두 번
const violatedNicknameKey = (error) => String(error.meta?.target ?? '').includes('nickname_key');

// PUT /community/me/profile { nickname, complexId? }
// 처음 정하기는 언제든, 바꾸기는 마지막으로 바꾼 때부터 30일 뒤. 지금 닉네임과 똑같으면 아무것도 바꾸지 않는다(바꾼 것으로 치지 않음).
// 같은 닉네임을 동시에 정하면 DB 유일 제약(nickname_key)이 하나만 받고 나머지는 409 COMMUNITY_NICKNAME_TAKEN.
// 같은 사람이 동시에 두 번 바꾸면 마지막으로 바꾼 시각이 그대로일 때만 고쳐서 한 번만 바뀐다.
export const setMyNickname = async (user, { nickname: rawNickname, complexId }, now = new Date()) => {
  const nickname = cleanNickname(rawNickname);
  const problem = checkNickname(nickname);
  if (problem === 'BANNED') {
    throw invalid('COMMUNITY_NICKNAME_NOT_ALLOWED', '쓸 수 없는 낱말이 들어 있습니다.', '운영자 · 관리자 · 버틀러처럼 운영 주체로 보이는 낱말은 쓸 수 없습니다.');
  }
  if (problem) {
    throw invalid(
      'COMMUNITY_NICKNAME_INVALID',
      '닉네임 형식이 맞지 않습니다.',
      `${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자, 한글 · 영문 · 숫자와 가운데 공백 하나까지 쓸 수 있습니다.`,
    );
  }
  const nicknameKey = toNicknameKey(nickname);

  const current = await prisma.communityProfile.findUnique({ where: { userId: user.id } });
  if (current?.nickname === nickname) return toProfile(user, current, complexId, now);
  if (current) {
    const next = nextNicknameChangeAt(current.nicknameChangedAt);
    if (next && next > now) throw tooSoonError(next);
  }

  try {
    if (!current) {
      await prisma.communityProfile.create({ data: { userId: user.id, nickname, nicknameKey } });
    } else {
      const { count } = await prisma.communityProfile.updateMany({
        where: { userId: user.id, nicknameChangedAt: current.nicknameChangedAt },
        data: { nickname, nicknameKey, nicknameChangedAt: now },
      });
      // 그사이 다른 요청이 먼저 바꿨다 — 그 요청이 30일을 새로 시작했다
      if (count === 0) throw tooSoonError(nextNicknameChangeAt(now));
    }
  } catch (error) {
    if (isUniqueViolation(error) && violatedNicknameKey(error)) throw takenError();
    if (isUniqueViolation(error)) return findMyProfile(user, { complexId }, now);
    throw error;
  }
  return findMyProfile(user, { complexId }, now);
};

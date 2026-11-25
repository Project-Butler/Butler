// Created: 2026-11-17 04:09
// 권리자 인증 시작 전 본인인증(포트원 V2 · KG이니시스 통합인증) 창 열기.
// 인증 결과(이름·생년월일)는 화면에서 다루지 않는다. 서버가 identityVerificationId로 포트원에 직접 조회해 회원 정보와 비교한다.
import { requestIdentityVerification } from '@portone/browser-sdk/v2';

const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID;
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_IDENTITY_CHANNEL_KEY;

export const IDENTITY_VERIFICATION_PREPARING_MESSAGE = '본인인증을 준비 중이에요. 잠시 후 다시 시도해 주세요.';
export const IDENTITY_VERIFICATION_INCOMPLETE_MESSAGE = '본인인증을 완료하지 못했어요. 다시 시도해 주세요.';
export const IDENTITY_VERIFICATION_OPEN_FAILED_MESSAGE = '본인인증 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.';

// 휴대폰(리디렉션 방식)에서 본인인증 페이지로 떠나기 전에 남기는 요청 정보. 돌아오면 이 값으로 권리자 인증 요청을 잇는다.
// 같은 탭에서만 이어지면 되므로 sessionStorage에 둔다. 오래된 값은 쓰지 않는다.
const PENDING_KEY = 'butler.pendingIdentityVerification';
const PENDING_MAX_AGE_MS = 30 * 60 * 1000;

// 이니시스 통합인증 ID 규칙(영문·숫자)에 맞춘다.
const createIdentityVerificationId = () => `iv${crypto.randomUUID().replaceAll('-', '')}`;

const savePending = (pending) => {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, savedAt: Date.now() }));
  } catch {
    // 저장소를 못 쓰면(사생활 보호 모드 등) 돌아와서 이어 가지 못하고 다시 시도하라고 안내한다.
  }
};

const readPending = () => {
  try {
    const pending = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) ?? 'null');
    return pending && Date.now() - pending.savedAt <= PENDING_MAX_AGE_MS ? pending : null;
  } catch {
    return null;
  }
};

export const clearPendingIdentityVerification = () => {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // 지우지 못해도 다음 요청이 덮어쓰고, 오래된 값은 쓰지 않는다.
  }
};

// 본인인증 창을 열고 { identityVerificationId } 또는 { error: { message } }를 돌려준다. 취소·실패도 error다.
// redirectUrl: 휴대폰처럼 리디렉션 방식으로 열릴 때 인증을 마치고 돌아올 주소(절대 주소). PC 팝업에서는 쓰이지 않는다.
// pending: 리디렉션으로 떠날 때 남겨 둘 값(ownershipId·testMode 등). 돌아오면 readIdentityVerificationRedirect로 읽는다.
export const requestOwnerIdentityVerification = async ({ redirectUrl, pending } = {}) => {
  if (!STORE_ID || !CHANNEL_KEY) return { error: { message: IDENTITY_VERIFICATION_PREPARING_MESSAGE } };

  const identityVerificationId = createIdentityVerificationId();
  if (redirectUrl) savePending({ ...pending, identityVerificationId });

  let response;
  try {
    response = await requestIdentityVerification({
      storeId: STORE_ID,
      channelKey: CHANNEL_KEY,
      identityVerificationId,
      // 이니시스 통합인증 필수 값. N이면 사용자가 인증 창에서 인적사항을 직접 입력한다.
      bypass: { inicisUnified: { flgFixedUser: 'N' } },
      ...(redirectUrl && { redirectUrl }),
    });
  } catch {
    // 채널 설정 오류 등 인증 창을 띄우기 전 실패는 예외로 온다.
    clearPendingIdentityVerification();
    return { error: { message: IDENTITY_VERIFICATION_OPEN_FAILED_MESSAGE } };
  }
  // 응답이 없으면 리디렉션으로 페이지를 떠나는 중일 수 있어 남긴 값을 지우지 않는다.
  if (!response) return { error: { message: IDENTITY_VERIFICATION_INCOMPLETE_MESSAGE } };
  // 팝업으로 끝났으면 리디렉션용으로 남긴 값은 필요 없다.
  clearPendingIdentityVerification();
  if (response.code !== undefined) return { error: { message: IDENTITY_VERIFICATION_INCOMPLETE_MESSAGE } };
  return { identityVerificationId: response.identityVerificationId };
};

// 리디렉션으로 돌아온 주소(search)에서 본인인증 결과를 읽는다. 읽기만 하고 남긴 값은 지우지 않는다(clearPendingIdentityVerification).
// 돌아온 것이 아니면 null. 실패·취소이거나 떠나기 전 남긴 값과 맞지 않으면 { error }, 맞으면 { identityVerificationId, pending }.
export const readIdentityVerificationRedirect = (search) => {
  const params = new URLSearchParams(search);
  const identityVerificationId = params.get('identityVerificationId');
  if (!identityVerificationId) return null;

  const pending = readPending();
  if (params.get('code') || pending?.identityVerificationId !== identityVerificationId) {
    return { error: { message: IDENTITY_VERIFICATION_INCOMPLETE_MESSAGE } };
  }
  return { identityVerificationId, pending };
};

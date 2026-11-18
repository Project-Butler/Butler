// Created: 2026-11-17 04:09
// 권리자 인증 시작 전 본인인증(포트원 V2 · KG이니시스 통합인증) 창 열기.
// 인증 결과(이름·생년월일)는 화면에서 다루지 않는다. 서버가 identityVerificationId로 포트원에 직접 조회해 회원 정보와 비교한다.
import { requestIdentityVerification } from '@portone/browser-sdk/v2';

const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID;
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_IDENTITY_CHANNEL_KEY;

export const IDENTITY_VERIFICATION_PREPARING_MESSAGE = '본인인증을 준비 중이에요. 잠시 후 다시 시도해 주세요.';
export const IDENTITY_VERIFICATION_INCOMPLETE_MESSAGE = '본인인증을 완료하지 못했어요. 다시 시도해 주세요.';
export const IDENTITY_VERIFICATION_OPEN_FAILED_MESSAGE = '본인인증 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.';

// 이니시스 통합인증 ID 규칙(영문·숫자)에 맞춘다.
const createIdentityVerificationId = () => `iv${crypto.randomUUID().replaceAll('-', '')}`;

// 본인인증 창을 열고 { identityVerificationId } 또는 { error: { message } }를 돌려준다. 취소·실패도 error다.
export const requestOwnerIdentityVerification = async () => {
  if (!STORE_ID || !CHANNEL_KEY) return { error: { message: IDENTITY_VERIFICATION_PREPARING_MESSAGE } };

  let response;
  try {
    response = await requestIdentityVerification({
      storeId: STORE_ID,
      channelKey: CHANNEL_KEY,
      identityVerificationId: createIdentityVerificationId(),
      // 이니시스 통합인증 필수 값. N이면 사용자가 인증 창에서 인적사항을 직접 입력한다.
      bypass: { inicisUnified: { flgFixedUser: 'N' } },
    });
  } catch {
    // 채널 설정 오류 등 인증 창을 띄우기 전 실패는 예외로 온다.
    return { error: { message: IDENTITY_VERIFICATION_OPEN_FAILED_MESSAGE } };
  }
  if (!response || response.code !== undefined) return { error: { message: IDENTITY_VERIFICATION_INCOMPLETE_MESSAGE } };
  return { identityVerificationId: response.identityVerificationId };
};

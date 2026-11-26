// 앱 내 정보 화면 계산. 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
import { formatDateKST } from '../../web/utils/format';
import { getVerificationAction } from '../../web/utils/ownershipVerification';
import { getVerificationBadge } from '../../web/utils/verificationBadge';

const VERIFY_LABEL = { VERIFY: '인증하기', RENEW: '재인증하기' };

// 이름 첫 글자(아바타). 이름이 없으면 빈 문자열.
export const getInitial = (name) => (name ?? '').trim().charAt(0);

// 호실 줄 아래 설명. 인증 완료는 인증일, 재인증 기간이면 만료일을 같이 보여 준다.
const describe = (ownership, action) => {
  const verifiedOn = formatDateKST(ownership.verifiedAt);
  const expiresOn = formatDateKST(ownership.verificationExpiresAt);
  switch (ownership.verificationStatus) {
    case 'VERIFIED':
      return action === 'RENEW' && expiresOn ? `${expiresOn}에 인증 만료` : verifiedOn ? `인증 ${verifiedOn}` : '인증 완료';
    case 'EXPIRED':
      return expiresOn ? `${expiresOn}에 인증 만료` : '인증 만료';
    case 'REVOKED':
      return '인증 취소 · 관리자에게 문의해 주세요';
    default:
      return '아직 인증하지 않았어요';
  }
};

// ownerships: 활성 소유 관계 목록(GET /property-ownerships?active=true). 호실 이름·상태 칩·설명·버튼 문구로 바꾼다.
// 버튼(verifyLabel)은 첫 인증·재인증일 때만 있다. 인증 완료(갱신 기간 전)·취소는 칩만 보여 준다.
export const toVerificationRows = (ownerships, now = new Date()) =>
  ownerships.map((ownership) => {
    const action = getVerificationAction(ownership, now);
    return {
      id: ownership.id,
      propertyId: ownership.property.id,
      title: ownership.property.displayName,
      description: describe(ownership, action),
      badge: getVerificationBadge(ownership.verificationStatus),
      verifyLabel: VERIFY_LABEL[action] ?? null,
    };
  });

// 내 권한 표. 커뮤니티 쓰기 권한은 법정동 단위라(계약 9장) '인증한 동네만'으로 적는다. 분쟁 AI 상담은 임대인이면 쓸 수 있다.
export const toPermissionRows = (verifiedLegalDongCodes = []) => [
  { key: 'role', label: '역할', value: '임대인' },
  { key: 'community', label: '커뮤니티 글쓰기·투표', value: verifiedLegalDongCodes.length > 0 ? '인증한 동네만' : '권리자 인증 후 가능' },
  { key: 'disputeChat', label: '분쟁 상담 AI', value: '사용 가능' },
];

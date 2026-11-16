// 앱 계약 관리(M07) 표시 계산. 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
import { formatUnitLabel } from '../../web/utils/unitAddress';
import { formatPeriod, formatRentPaymentDay, formatWon, getLeaseTypeLabel } from '../../web/utils/contract';

// 계약갱신청구권은 1회 기준이다. 이전 계약(previousContractId)에서 이어진 계약이면 이미 갱신한 것으로 본다.
const RENEWAL_LIMIT = 1;

// 임차인이 초대를 받아 가입·연결됐으면(tenant.userId) '초대 수락', 아니면 '초대 전'.
export const getInvitationLabel = (contract) => (contract.tenant?.userId ? '초대 수락' : '초대 전');

export const getRenewalRemaining = (contract) => (contract.previousContractId ? RENEWAL_LIMIT - 1 : RENEWAL_LIMIT);

// 상단 바 제목: '계약 · 101동 101호'
export const getContractTitle = (contract) => `계약 · ${formatUnitLabel(contract.property.buildingNo, contract.property.unitNo)}`;

// '현재 계약' 카드 행. 전세면 월세 행을 뺀다. numeric 은 숫자 글꼴로 보여 줄 행.
export const toContractRows = (contract) => {
  const isJeonse = contract.leaseType === 'JEONSE';
  const rentDay = formatRentPaymentDay(contract.rentPaymentDay);
  return [
    { label: '임차인', value: `${contract.tenantName} · ${getInvitationLabel(contract)}` },
    { label: '계약 기간', value: formatPeriod(contract), numeric: true },
    { label: '보증금', value: formatWon(contract.deposit), numeric: true },
    !isJeonse && {
      label: '월세',
      value: [formatWon(contract.monthlyRent), rentDay].filter(Boolean).join(' · '),
      numeric: true,
    },
    { label: '형태', value: `${getLeaseTypeLabel(contract.leaseType)} · 갱신 ${getRenewalRemaining(contract)}회 남음` },
  ].filter(Boolean);
};

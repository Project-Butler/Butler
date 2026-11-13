// 앱 부동산 상세(M06) 표시 계산. 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
import { formatDday, formatManwon, getContractDdayBadge } from '../../web/utils/contract';
import { getVerificationAction } from '../../web/utils/ownershipVerification';
import { formatAssetSpec } from './assets';

const EMPTY = '—';

// 준공연도: 단지 buildingInfo.approvalDate(사용승인일 'YYYY-MM-DD')의 연도. 없으면 null.
export const getBuiltYear = (complex) => complex?.buildingInfo?.approvalDate?.slice(0, 4) ?? null;

// '원룸 · 전용 84.92m² · 2009년 준공'. 준공연도가 없으면 그 칸을 통째로 뺀다.
export const formatPropertySpec = (property, complex) => {
  const year = getBuiltYear(complex);
  return [formatAssetSpec(property), year ? `${year}년 준공` : null].filter(Boolean).join(' · ');
};

// 요약 3칸(보증금·월세·계약 만기). 지금 계약이 없으면 '—'. 전세면 월세 칸은 '전세'.
export const toSummaryStats = (contract) => {
  if (!contract) {
    return { deposit: EMPTY, rent: EMPTY, dday: { label: EMPTY, tone: 'default' } };
  }
  const dday = getContractDdayBadge(contract);
  return {
    deposit: formatManwon(contract.deposit),
    rent: contract.leaseType === 'JEONSE' ? '전세' : formatManwon(contract.monthlyRent),
    dday: dday ?? { label: formatDday(contract.daysUntilEnd) ?? EMPTY, tone: 'default' },
  };
};

// ⋯ 더보기: 다른 화면으로 가는 동작만(수정·소유 종료는 웹 상세에서). 지금 소유 중일 때만 연다.
// 반환: [{ key, label, target: { key, params } }]
export const getMoreMenuTargets = (property) => {
  const relation = property.myRelation;
  if (relation?.type !== 'OWNER') return [];
  const propertyId = property.id;
  const action = getVerificationAction({ isActive: true, verificationStatus: relation.verificationStatus });
  const targets = [];
  if (action === 'VERIFY' || action === 'RENEW') {
    targets.push({ key: 'verify', label: action === 'VERIFY' ? '권리자 인증' : '권리자 재인증', target: { key: 'propertyVerify', params: { propertyId } } });
  }
  if (relation.verificationStatus === 'VERIFIED' && property.status === 'VACANT') {
    targets.push({ key: 'contract', label: '계약 등록', target: { key: 'contractRegister', params: { propertyId } } });
  }
  targets.push({ key: 'log', label: '관리 로그 기록 추가', target: { key: 'propertyLogRegister', params: { propertyId } } });
  return targets;
};

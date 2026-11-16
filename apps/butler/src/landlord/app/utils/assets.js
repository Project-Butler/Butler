// 앱 내 자산(M05) 카드 계산. 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
// 호실 목록 응답에는 계약 정보가 없어, 시작 전·진행 중 계약 목록(종료일 오름차순)을 한 번 받아 호실에 붙인다.
import { formatManwon } from '../../web/utils/contract';
import { getVerificationAction } from '../../web/utils/ownershipVerification';
import { getUnitTypeLabel } from '../../web/utils/unitListing';
import { getVerificationBadge } from '../../web/utils/verificationBadge';

export const SEGMENTS = { ALL: 'all', LEASED: 'leased', VACANT: 'vacant' };

// 공실(VACANT)이 아니면 계약 중으로 센다(시작 전 계약이 있는 CONTRACT_PENDING 포함).
const isVacant = (property) => property.status === 'VACANT';

// '원룸 · 전용 84.92m²'. 값이 없는 칸은 뺀다.
export const formatAssetSpec = ({ myListing, exclusiveArea }) =>
  [getUnitTypeLabel(myListing?.unitType), exclusiveArea != null ? `전용 ${exclusiveArea}m²` : null].filter(Boolean).join(' · ');

// 카드 아래 버튼. 첫 인증이면 '인증하기', 재인증이면 '재인증하기'. 할 일이 없거나 관리자 문의(인증 취소)면 null.
// 호실 목록의 myRelation 에는 isActive·만료일이 없으므로 내 자산(소유 중) 기준으로 상태만 본다.
const VERIFY_LABEL = { VERIFY: '인증하기', RENEW: '재인증하기' };
const getVerifyLabel = (verificationStatus) =>
  VERIFY_LABEL[getVerificationAction({ isActive: true, verificationStatus })] ?? null;

// properties: 호실 목록 items, contracts: 계약 목록 items(종료일 오름차순). 호실마다 종료일이 가장 가까운 계약 하나를 붙인다.
export const toAssetCards = (properties, contracts = []) => {
  const contractByProperty = new Map();
  contracts.forEach((contract) => {
    if (!contractByProperty.has(contract.property.id)) contractByProperty.set(contract.property.id, contract);
  });

  return properties.map((property) => {
    const vacant = isVacant(property);
    const contract = vacant ? null : (contractByProperty.get(property.id) ?? null);
    const verificationStatus = property.myRelation?.verificationStatus;
    return {
      id: property.id,
      property,
      title: property.displayName,
      spec: formatAssetSpec(property),
      verification: getVerificationBadge(verificationStatus),
      verifyLabel: getVerifyLabel(verificationStatus),
      vacant,
      tenantLine: vacant ? '공실 · 임차인 없음' : contract ? `임차인 ${contract.tenantName} · 계약 중` : '계약 중',
      // 공실이면 보증금을 보여 주지 않는다.
      depositLabel: contract ? `보증금 ${formatManwon(contract.deposit)}` : null,
    };
  });
};

export const countSegments = (cards) => ({
  [SEGMENTS.ALL]: cards.length,
  [SEGMENTS.LEASED]: cards.filter((card) => !card.vacant).length,
  [SEGMENTS.VACANT]: cards.filter((card) => card.vacant).length,
});

const normalize = (value) => (value ?? '').replace(/\s+/g, '').toLowerCase();

// 검색어는 호실 이름(단지명 동 호)·단지명·도로명주소에서 띄어쓰기 없이 찾는다.
export const filterAssets = (cards, { query = '', segment = SEGMENTS.ALL } = {}) => {
  const keyword = normalize(query);
  return cards.filter((card) => {
    if (segment === SEGMENTS.LEASED && card.vacant) return false;
    if (segment === SEGMENTS.VACANT && !card.vacant) return false;
    if (!keyword) return true;
    const { property } = card;
    return [property.displayName, property.complex?.name, property.complex?.roadAddress].some((value) => normalize(value).includes(keyword));
  });
};

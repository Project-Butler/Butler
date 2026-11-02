// 최근 활동(GET /activities) type + params → 화면 문장. 서버는 문장을 저장하지 않는다(apps/api platform/activityLog.js).
import { formatUnitLabel } from './unitAddress';

const FIELD_LABEL = {
  name: '건물명',
  capacity: '전체 호실 수',
  memo: '설명',
  exclusiveArea: '면적',
  floor: '층',
  acquiredYearMonth: '취득 연월',
  purchasePrice: '매입가',
  unitType: '방 구성',
  equipment: '설비',
  equipmentEtc: '기타 설비',
  leaseType: '계약 유형',
  deposit: '보증금',
  monthlyRent: '월세',
  startDate: '시작일',
  endDate: '종료일',
  tenantName: '임차인 이름',
  tenantPhone: '임차인 연락처',
};

// labels: 활동마다 다르게 부를 칸 이름(계약 memo는 '메모')
const formatFields = (fields, labels = {}) =>
  Array.isArray(fields) && fields.length > 0
    ? ` (${fields.map((field) => labels[field] ?? FIELD_LABEL[field] ?? field).join(', ')})`
    : '';

// 건물명이 기록돼 있으면 앞에 붙인다: '항여울 116동 712호'
const unitOf = (params) => {
  if (!params.unitNo) return params.buildingName ?? '호실';
  const unit = formatUnitLabel(params.buildingNo ?? '', params.unitNo);
  return params.buildingName ? `${params.buildingName} ${unit}` : unit;
};

const tenantOf = (params) => (params.tenantName ? ` ${params.tenantName}님` : '');

export const formatActivity = ({ type, params = {} }) => {
  switch (type) {
    case 'LANDLORD_BUILDING_CREATED':
      return params.auto
        ? `호실을 등록하면서 '${params.buildingName}' 건물이 만들어졌어요`
        : `'${params.buildingName}' 건물을 등록했어요`;
    case 'LANDLORD_BUILDING_UPDATED':
      return `'${params.buildingName}' 건물 정보를 수정했어요${formatFields(params.fields)}`;
    case 'LANDLORD_BUILDING_DELETED':
      return `'${params.buildingName}' 건물을 삭제했어요`;
    case 'PROPERTY_REGISTERED':
      return `${unitOf(params)}를 등록했어요`;
    case 'PROPERTY_UPDATED':
      return `${unitOf(params)} 정보를 수정했어요${formatFields(params.fields)}`;
    case 'OWNERSHIP_UPDATED':
      return `${unitOf(params)} 임대 조건을 수정했어요${formatFields(params.fields)}`;
    case 'OWNERSHIP_ENDED':
      return `${unitOf(params)}를 삭제했어요(소유 종료)`;
    // 계약 활동 params에는 금액·연락처가 없다(명세 3-6). 임차인 이름이 있으면 붙인다.
    case 'CONTRACT_CREATED':
      return `${unitOf(params)}${tenantOf(params)} 계약을 등록했어요`;
    case 'CONTRACT_UPDATED':
      return `${unitOf(params)}${tenantOf(params)} 계약을 수정했어요${formatFields(params.fields, { memo: '메모' })}`;
    case 'CONTRACT_TERMINATED':
      return `${unitOf(params)}${tenantOf(params)} 계약을 해지했어요`;
    default:
      return '활동';
  }
};

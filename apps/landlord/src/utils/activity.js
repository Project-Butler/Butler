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
};

const formatFields = (fields) =>
  Array.isArray(fields) && fields.length > 0 ? ` (${fields.map((field) => FIELD_LABEL[field] ?? field).join(', ')})` : '';

const unitOf = (params) => (params.unitNo ? formatUnitLabel(params.buildingNo ?? '', params.unitNo) : '호실');

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
      return `${params.buildingName ? `${params.buildingName} ` : ''}${unitOf(params)}를 등록했어요`;
    case 'PROPERTY_UPDATED':
      return `${unitOf(params)} 정보를 수정했어요${formatFields(params.fields)}`;
    case 'OWNERSHIP_UPDATED':
      return `${unitOf(params)} 임대 조건을 수정했어요${formatFields(params.fields)}`;
    case 'OWNERSHIP_ENDED':
      return `${unitOf(params)}를 삭제했어요(소유 종료)`;
    default:
      return '활동';
  }
};

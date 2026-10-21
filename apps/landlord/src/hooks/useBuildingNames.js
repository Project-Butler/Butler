import { useCallback, useMemo } from 'react';
import { formatUnitLabel } from '../utils/unitAddress';
import { useGetLandlordBuildingList } from './useGetLandlordBuildingList';

// 목록 API 최대 크기. 건물이 이보다 많으면 나머지는 단지 이름으로 보인다.
const BUILDING_NAME_SIZE = 50;

// 호실을 "내가 붙인 건물명 + 동·호"로 보여 주기 위한 complexId → 건물명 표.
// 서버 displayName은 juso 건물명(단지 이름)이라, 임대인이 붙인 이름과 달라 다른 호실처럼 보일 수 있다.
// 내 건물 설정이 없는 단지(예전 소유·임차 호실)는 서버 displayName을 그대로 쓴다.
export const useBuildingNames = ({ onUnauthorized } = {}) => {
  const { data } = useGetLandlordBuildingList({ size: BUILDING_NAME_SIZE }, { onUnauthorized });

  const nameByComplexId = useMemo(
    () => new Map((data?.items ?? []).map((building) => [building.complex.id, building.name])),
    [data],
  );

  const getBuildingName = useCallback((complexId) => nameByComplexId.get(complexId) ?? null, [nameByComplexId]);

  const getPropertyName = useCallback(
    (property) => {
      const buildingName = nameByComplexId.get(property.complex?.id);
      return buildingName ? `${buildingName} ${formatUnitLabel(property.buildingNo, property.unitNo)}` : property.displayName;
    },
    [nameByComplexId],
  );

  return { getBuildingName, getPropertyName };
};

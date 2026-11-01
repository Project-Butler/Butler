// 테스트 전용: 건물DB 형식 줄 → 변동 연산, 메모리 맵 적용. 적용 엔진·묶기·같음 테스트가 SQL 없이 연산을 만든다.
import { matchBuilding, parseBuildingLine } from '../referenceData/jusoBuildingMatcher.js';
import { CHANGE_REASONS } from '../referenceData/jusoDeltaApplier.js';

export const planDeltaLine = (line, lookup) => {
  const row = parseBuildingLine(line);
  if (!row) return { kind: 'invalid' };
  const reason = CHANGE_REASONS[row.changeReasonCode];
  if (!reason) return { kind: 'unknown', code: row.changeReasonCode ?? '' };
  if (reason === 'DELETE') return { kind: 'delete', buildingMgtNo: row.buildingMgtNo, row };
  const link = matchBuilding(row, lookup);
  return link ? { kind: 'upsert', link, row } : { kind: 'delete', buildingMgtNo: row.buildingMgtNo, row };
};

export const applyOpsToMap = (map, { upserts, deletes }) => {
  for (const buildingMgtNo of deletes) map.delete(buildingMgtNo);
  for (const link of upserts) map.set(link.buildingMgtNo, link);
  return map;
};

// shadow 비교: 같은 변동(연계 기준일 L = 일변동분 stdde L-1)을 두 경로로 계획만 해서 건물마다 "적용 뒤 결과"를 비교한다.
// 결과 = 단지 코드 + 도로명 키(규칙 이름은 비교하지 않는다 — 공식 연계는 공동주택 여부를 모르면 NON_APT_FLAG로 남겨서).
// 비교 대상은 두 경로 중 하나라도 건드린 건물이다. 둘 다 결과가 지금과 같으면(변경 없는 34 등) 같음으로 센다.
// 차이 분류: renameUnresolved(도로명 변경 뒤 기존 연결 유지), kaptInactive(비활성 단지 연결 유지),
//            blindSpot(일변동분에만 있는 변경 — 동 표시에 안 나온 건물), 그 밖은 unexplained(전환 기준에서 0이어야 함).
import { roadKeyId } from './jusoBuildingMatcher.js';

const MAX_LISTED_DIFFS = 50;

const outcomeId = (link) =>
  link
    ? `${link.kaptCode}|${roadKeyId({
        sigunguCd: link.roadSigunguCd,
        roadNameKey: link.roadNameKey,
        underground: link.roadUnderground,
        mainNo: link.roadMainNo,
        subNo: link.roadSubNo,
      })}`
    : 'none';

// 연산 배열 → Map(건물관리번호 → 마지막 연산). 줄 순서대로 적용한 것과 같다.
const lastOps = (ops) => {
  const map = new Map();
  for (const op of ops) {
    if (op.kind === 'upsert') map.set(op.link.buildingMgtNo, op);
    else if (op.kind === 'delete' || op.kind === 'unresolved') map.set(op.buildingMgtNo, op);
  }
  return map;
};

const afterOp = (op, before) => {
  if (!op) return before;
  if (op.kind === 'upsert') return op.link;
  if (op.kind === 'delete') return null;
  return before; // unresolved: 쓰지 않음
};

const classify = (newOp) => {
  if (!newOp) return 'blindSpot';
  if (newOp.kind === 'unresolved' && newOp.reason === 'road name changed') return 'renameUnresolved';
  if (newOp.kind === 'unresolved' && newOp.reason === 'kapt inactive') return 'kaptInactive';
  return 'unexplained';
};

// deltaOps: 건물DB 일변동분 계획(planDeltaFile.ops), linkOps: 공식 연계 계획(planJusoLinkDay.ops),
// existing: Map(건물관리번호 → 지금 연결 행). 결과는 shadow 기록 stats에 그대로 남긴다.
export const compareShadowPlans = ({ deltaOps, linkOps, existing }) => {
  const oldMap = lastOps(deltaOps);
  const newMap = lastOps(linkOps);
  const buildings = new Set([...oldMap.keys(), ...newMap.keys()]);
  const explained = { renameUnresolved: 0, kaptInactive: 0, blindSpot: 0 };
  const diffs = [];
  let same = 0;
  let unexplained = 0;
  for (const buildingMgtNo of buildings) {
    const before = existing.get(buildingMgtNo) ?? null;
    const oldAfter = outcomeId(afterOp(oldMap.get(buildingMgtNo), before));
    const newAfter = outcomeId(afterOp(newMap.get(buildingMgtNo), before));
    if (oldAfter === newAfter) {
      same += 1;
      continue;
    }
    const reason = classify(newMap.get(buildingMgtNo));
    if (reason === 'unexplained') unexplained += 1;
    else explained[reason] += 1;
    if (diffs.length < MAX_LISTED_DIFFS) diffs.push({ buildingMgtNo, delta: oldAfter, link: newAfter, reason });
  }
  return { compared: buildings.size, same, unexplained, explained, diffs };
};

// 7일 연속(incomplete 제외) 설명되지 않는 차이 0건 + unresolved 1% 미만이면 전환해도 된다.
// rows: JUSO_LINK_SHADOW 기록의 stats 배열(최근 것부터)
export const SHADOW_STREAK_DAYS = 7;
export const evaluateShadowStreak = (rows) => {
  let streak = 0;
  for (const stats of rows) {
    if (!stats || stats.incomplete) continue;
    const unresolvedRatio = stats.link?.considered ? stats.link.unresolvedCount / stats.link.considered : 0;
    if (stats.compare?.unexplained !== 0 || unresolvedRatio >= 0.01) break;
    streak += 1;
    if (streak >= SHADOW_STREAK_DAYS) break;
  }
  return { streak, ready: streak >= SHADOW_STREAK_DAYS };
};

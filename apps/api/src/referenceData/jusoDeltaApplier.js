// juso 건물DB 변동분(TI_SPBD_BULD) 적용 계획 — 순수 함수(DB·외부 호출 없음).
// CLI(apply:juso-changes)와 매일 cron이 같이 쓴다. 입력은 줄 묶음과 K-apt 조회(lookup), 출력은 upsert·delete 목록.
//
// 이동사유코드(전체분 zip 안 [가이드]건물DB 활용방법.pdf p10·p13, 2026-10 확인):
//   31 신규, 73 건물군내 일부 건물 생성 → 추가
//   34 변동                             → 해당 키(건물관리번호)의 정보를 새 내용으로
//   63 폐지, 72 건물군내 일부 건물 폐지 → 삭제
// 추가·변동은 같은 처리다: 다시 맞춰서 맞으면 upsert, 안 맞으면 delete(이전에 맞았던 연결을 지움).
// 그 밖의 코드는 모른다 — 하나라도 있으면 그 파일은 게이트 실패(쓰기 0).
import { matchBuilding, parseBuildingLine, toBuildingRoadKey } from './jusoBuildingMatcher.js';

export const CHANGE_REASONS = {
  31: 'ADD',
  73: 'ADD',
  34: 'CHANGE',
  63: 'DELETE',
  72: 'DELETE',
};

// 게이트 상한
export const MAX_PARSE_FAILURE_RATIO = 0.01;
export const MAX_DELETE_RATIO = 0.02;

// 변동 없는 날의 파일 내용(실제 파일은 'No Data' 7바이트)
const NO_DATA_PATTERN = /^no\s*data$/i;

// 파일 글자 → 줄 배열(빈 줄 제외, CRLF 처리). 'No Data'뿐이면 빈 배열.
export const splitDeltaLines = (text) => {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  if (lines.length === 1 && NO_DATA_PATTERN.test(lines[0].trim())) return [];
  return lines;
};

// 줄 → 연산. { kind: 'upsert', link, row } | { kind: 'delete', buildingMgtNo, row } |
// { kind: 'invalid' }(파싱 실패) | { kind: 'unknown', code }(모르는 이동사유코드)
export const planDeltaLine = (line, lookup) => {
  const row = parseBuildingLine(line);
  if (!row) return { kind: 'invalid' };
  const reason = CHANGE_REASONS[row.changeReasonCode];
  if (!reason) return { kind: 'unknown', code: row.changeReasonCode ?? '' };
  if (reason === 'DELETE') return { kind: 'delete', buildingMgtNo: row.buildingMgtNo, row };
  const link = matchBuilding(row, lookup);
  return link ? { kind: 'upsert', link, row } : { kind: 'delete', buildingMgtNo: row.buildingMgtNo, row };
};

// 파일 전체 검사(쓰기 전). existingDeleteCount = delete 연산 대상 중 지금 표에 있는 행 수, totalLinks = 표 전체 행 수.
// 결과: { ok: true } | { ok: false, reason }
export const evaluateDeltaGate = ({ lineCount, invalidCount, unknownCodes, existingDeleteCount, totalLinks }) => {
  // 줄 대부분이 31칸이 아니면 파일 형식이 바뀐 것으로 본다(머리글은 없다).
  if (lineCount > 0 && invalidCount * 2 > lineCount) return { ok: false, reason: 'format changed' };
  if (unknownCodes.length > 0) return { ok: false, reason: `unknown change reason code: ${unknownCodes.join(',')}` };
  if (lineCount > 0 && invalidCount / lineCount > MAX_PARSE_FAILURE_RATIO) {
    return { ok: false, reason: `parse failures ${invalidCount}/${lineCount}` };
  }
  if (totalLinks > 0 && existingDeleteCount / totalLinks > MAX_DELETE_RATIO) {
    return { ok: false, reason: `too many deletes ${existingDeleteCount}/${totalLinks}` };
  }
  return { ok: true };
};

// 줄 묶음 → 한 트랜잭션에 쓸 목록. 같은 건물관리번호가 여러 번 나오면 뒤의 줄이 이긴다(줄 순서대로 적용한 것과 같음).
// addressRows: 추가·변동 줄의 건물 행(단지 대표 건물관리번호의 주소 칸 고치기용, 마지막 줄만).
// 도로명 원문이 없거나(키만 앎) 주소 글자를 다 만들 수 없는 행(skipAddress)은 주소 칸을 고치지 않는다.
// upsert·delete가 아닌 연산은 쓰지 않는다. 공식 연계의 unresolved는 "마지막 연산"으로는 세서(같은 건물의 앞 연산을 덮음)
// 그 건물을 아예 건드리지 않게 한다 — 기존 연결을 그대로 둔다.
export const collapseDeltaOps = (ops) => {
  const last = new Map();
  for (const op of ops) {
    if (op.kind !== 'upsert' && op.kind !== 'delete' && op.kind !== 'unresolved') continue;
    const buildingMgtNo = op.kind === 'upsert' ? op.link.buildingMgtNo : op.buildingMgtNo;
    last.delete(buildingMgtNo);
    last.set(buildingMgtNo, op);
  }
  const upserts = [];
  const deletes = [];
  const addressRows = [];
  for (const [buildingMgtNo, op] of last) {
    // unresolved가 마지막이면 같은 날 앞의 연산(63·34 등)도 쓰지 않는다 — 그 건물은 기존 연결 그대로(shadow 비교와 같은 뜻).
    if (op.kind === 'unresolved') continue;
    if (op.kind === 'upsert') upserts.push(op.link);
    else deletes.push(buildingMgtNo);
    const isDelete = CHANGE_REASONS[op.row.changeReasonCode] === 'DELETE';
    if (!isDelete && op.row.roadName && !op.row.skipAddress && toBuildingRoadKey(op.row)) addressRows.push(op.row);
  }
  return { upserts, deletes, addressRows };
};

// 메모리 맵(building_mgt_no → 연결 행)에 묶음을 적용한다. 같음 테스트와 커서 테스트가 SQL 대신 쓴다.
export const applyOpsToMap = (map, { upserts, deletes }) => {
  for (const buildingMgtNo of deletes) map.delete(buildingMgtNo);
  for (const link of upserts) map.set(link.buildingMgtNo, link);
  return map;
};

// juso 변동 연산 묶기 — 순수 함수(DB·외부 호출 없음). 공식 연계 계획(jusoLinkAdapter)의 연산을 트랜잭션 단위로 묶는다.
//
// 이동사유코드(전체분 zip 안 [가이드]건물DB 활용방법.pdf p10·p13, 2026-10 확인):
//   31 신규, 73 건물군내 일부 건물 생성 → 추가
//   34 변동                             → 해당 키(건물관리번호)의 정보를 새 내용으로
//   63 폐지, 72 건물군내 일부 건물 폐지 → 삭제
// 추가·변동은 같은 처리다: 다시 맞춰서 맞으면 upsert, 안 맞으면 delete(이전에 맞았던 연결을 지움).
import { toBuildingRoadKey } from './jusoBuildingMatcher.js';

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
    // unresolved가 마지막이면 같은 날 앞의 연산(63·34 등)도 쓰지 않는다 — 그 건물은 기존 연결 그대로.
    if (op.kind === 'unresolved') continue;
    if (op.kind === 'upsert') upserts.push(op.link);
    else deletes.push(buildingMgtNo);
    const isDelete = CHANGE_REASONS[op.row.changeReasonCode] === 'DELETE';
    if (!isDelete && op.row.roadName && !op.row.skipAddress && toBuildingRoadKey(op.row)) addressRows.push(op.row);
  }
  return { upserts, deletes, addressRows };
};

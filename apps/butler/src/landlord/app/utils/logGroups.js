// 앱 관리 로그(M08) 월별 묶음. 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.

// 기록이 연결된 대상 → 행 끝 파란 글자. 표에 없는 대상(또는 연결 없음)은 보여 주지 않는다.
const SOURCE_LABEL = { TICKET: '수리 요청', CONTRACT: '계약' };

export const getLogSourceLabel = (log) => SOURCE_LABEL[log.source?.resourceType] ?? null;

// '2026-10-20' → '10-20'
export const formatLogDay = (occurredOn) => occurredOn.slice(5);

// '2026-10' → '2026년 10월'
const toMonthLabel = (monthKey) => `${monthKey.slice(0, 4)}년 ${Number(monthKey.slice(5, 7))}월`;

// 기록을 날짜(occurredOn)의 달로 묶는다. 최신 달이 위, 달 안에서는 받은 순서를 지킨다.
export const groupLogsByMonth = (logs) => {
  const groups = new Map();
  logs.forEach((log) => {
    const key = log.occurredOn.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(log);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, items]) => ({ key, label: toMonthLabel(key), items }));
};

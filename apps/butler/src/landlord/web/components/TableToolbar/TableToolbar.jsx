// 표 위 작업 줄(필터 바): 머리의 주 행동과 떨어진 곳에 필터·초기화·건수를 모은다.
// children: 왼쪽 필터들, aside: 오른쪽 끝(건수·정렬 안내 등)
export const TableToolbar = ({ children, aside }) => (
  <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
    {children}
    {aside && <div className="ml-auto flex items-center gap-3 text-sub text-ink-3">{aside}</div>}
  </div>
);

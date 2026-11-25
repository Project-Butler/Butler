import { useRef } from 'react';
import { getRadioTabIndex, handleRadioKeyDown } from '../../../../shared/radioGroupKeys';
import { CheckRow, FilterRow } from '../LogFilterCard/LogFilterCard';
import { TICKET_STATUS_SEGMENTS } from '../../utils/ticketView';

// 상태 칸 하나(하나만 고른다). 개수는 모르면 숨긴다.
const SegmentButton = ({ label, count, selected, tabIndex, onClick, onKeyDown }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    tabIndex={tabIndex}
    onClick={onClick}
    onKeyDown={onKeyDown}
    className={`inline-flex h-10 items-center gap-1.5 rounded-btn border px-4 text-card-sm ${
      selected ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-surface font-medium text-ink-2 hover:bg-surface-2'
    }`}
  >
    {label}
    {count != null && <span className="font-num tabular-nums">{count}</span>}
  </button>
);

// PC 수리 요청 거르기 카드(시안 v2.2, D17). 하우스 로그 거르기 카드와 같은 줄 모양: 호실 · 상태 · 분류 · 방.
// - propertyField: 호실 줄에 넣을 고르기 칸.
// - segment·counts: 고른 상태 key 와 상태별 개수({ todo, all, done, canceled }, 모르면 없음).
// - categories·rooms: 고른 값 배열. 빈 배열 = 전체.
export const TicketFilterCard = ({ propertyField, segment, counts = {}, onSegmentChange, categoryOptions, categories, onCategoriesChange, roomOptions, rooms, onRoomsChange }) => {
  const groupRef = useRef(null);
  const selectedIndex = TICKET_STATUS_SEGMENTS.findIndex((item) => item.key === segment);
  // 화살표로 상태를 옮긴다(라디오 그룹 키보드 방식).
  const handleKeyDown = (event, index) =>
    handleRadioKeyDown(event, index, [...(groupRef.current?.querySelectorAll('[role="radio"]') ?? [])], (target) => onSegmentChange(TICKET_STATUS_SEGMENTS[target].key));
  return (
  <section aria-label="요청 거르기" className="overflow-hidden rounded-card border border-line bg-surface">
    <FilterRow label="호실">{propertyField}</FilterRow>
    <FilterRow label="상태">
      <div ref={groupRef} role="radiogroup" aria-label="상태" className="flex flex-wrap items-center gap-2 py-1">
        {TICKET_STATUS_SEGMENTS.map((item, index) => (
          <SegmentButton
            key={item.key}
            label={item.label}
            count={counts[item.key]}
            selected={segment === item.key}
            tabIndex={getRadioTabIndex(index, selectedIndex)}
            onClick={() => onSegmentChange(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          />
        ))}
      </div>
    </FilterRow>
    <CheckRow label="분류" options={categoryOptions} values={categories} onChange={onCategoriesChange} />
    <CheckRow label="방" options={roomOptions} values={rooms} onChange={onRoomsChange} />
  </section>
  );
};

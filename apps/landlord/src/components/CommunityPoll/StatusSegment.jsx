import { Segment } from '../CommunitySegment/Segment';

// 투표 목록의 "진행중 / 마감" 세그먼트
const STATUSES = [
  { value: 'OPEN', label: '진행중' },
  { value: 'CLOSED', label: '마감' },
];

// className: 감싸는 칸(PC 도구 줄에서 폭을 준다)
export const StatusSegment = ({ value, onChange, className = '' }) => (
  <div className={className}>
    <Segment label="투표 상태" options={STATUSES} value={value} onChange={onChange} />
  </div>
);

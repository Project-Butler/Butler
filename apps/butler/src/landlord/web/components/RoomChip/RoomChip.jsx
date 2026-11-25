import { getRoomLabel } from '../../utils/room';

// 방(위치) 칩. 방이 없으면 '—'.
export const RoomChip = ({ room }) => {
  const label = getRoomLabel(room);
  if (!label) return <span className="text-ink-3">—</span>;
  return (
    <span className="inline-block whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-chip font-medium text-ink-2">
      {label}
    </span>
  );
};

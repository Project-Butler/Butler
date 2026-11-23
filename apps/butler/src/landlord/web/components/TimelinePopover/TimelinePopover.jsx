import { useEffect, useRef } from 'react';
import { Badge } from '@butler/ui';
import { ArrowUpRight, History, PanelRightOpen, X } from 'lucide-react';
import { PrivateChip } from '../ManagementLogBadges/ManagementLogBadges';
import { RoomChip } from '../RoomChip/RoomChip';
import { formatWon } from '../../utils/contract';
import { getLogTypeLabel } from '../../utils/managementLog';

// 기록 유형 칩 색: 수리·수리 요청 완료는 초록, 점검·메모는 기본, 계약·통지는 남색(시안 색과 같음).
const TYPE_TONE = { REPAIR: 'success', TICKET_SUMMARY: 'success' };
const PLACEMENT_CLASS = {
  start: '-translate-x-6',
  center: '-translate-x-1/2',
  end: '-translate-x-[calc(100%-24px)]',
};
const ACTION_CLASS =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-btn border border-line bg-surface px-3.5 text-body font-semibold text-ink hover:bg-surface-2';

const TypeChip = ({ item }) =>
  item.kind === 'CONTRACT' ? <Badge tone="verified">계약·통지</Badge> : <Badge tone={TYPE_TONE[item.logType] ?? 'default'}>{getLogTypeLabel(item.logType)}</Badge>;

const ActionButton = ({ item, onShowLog, onShowContract }) =>
  item.kind === 'CONTRACT' ? (
    <button type="button" className={ACTION_CLASS} onClick={() => onShowContract(item.contractId)}>
      계약 보기
      <ArrowUpRight size={16} className="text-ink-3" aria-hidden="true" />
    </button>
  ) : (
    <button type="button" className={ACTION_CLASS} onClick={() => onShowLog(item.log.id)}>
      상세 보기
      <PanelRightOpen size={16} className="text-ink-3" aria-hidden="true" />
    </button>
  );

const firstLine = (text) => (text ? text.split('\n')[0] : null);

// 점 하나(기록 1건)의 자세한 내용: 날짜·유형·방·제목·나만 보기·내용 첫 줄·비용·이전 소유자 표시.
const SingleItem = ({ item }) => {
  if (item.kind === 'CONTRACT') {
    return (
      <>
        <p className="mt-1.5 text-card-sm font-semibold text-ink">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sub text-ink-2">{item.description}</p>}
      </>
    );
  }
  const { log } = item;
  return (
    <>
      <p className="mt-1.5 break-keep text-card-sm font-semibold text-ink">{log.title}</p>
      {log.scope === 'PRIVATE' && (
        <p className="mt-1">
          <PrivateChip />
        </p>
      )}
      {log.content && <p className="mt-0.5 line-clamp-1 break-all text-sub text-ink-2">{firstLine(log.content)}</p>}
      {log.cost != null && <p className="mt-1 font-num text-body font-semibold tabular-nums text-ink">{formatWon(log.cost)}</p>}
      {log.isFromPreviousOwner && (
        <p className="mt-2 flex items-center gap-1.5 text-sub text-ink-3">
          <History size={13} aria-hidden="true" />
          이전 소유자 기록 · 읽기 전용
        </p>
      )}
    </>
  );
};

// 타임라인 점의 작은 카드(H-26). 같은 날 점이 여럿이면 목록으로 보여 준다.
// - 열리면 카드에 포커스를 옮겨 Tab으로 안의 버튼에 닿는다. Esc·닫기는 onClose({ returnFocus: true })로 점에 포커스를 돌린다.
// - 바깥 누르기(점 자신은 제외 — 점은 다시 누르기로 닫는다)는 onClose({ returnFocus: false }).
// - placement: 오른쪽 끝 근처 'end', 왼쪽 끝 'start', 그 밖 'center'(utils getPopoverPlacement).
export const TimelinePopover = ({ group, percent, placement = 'center', anchorRef, onClose, onShowLog, onShowContract }) => {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    panelRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current({ returnFocus: true });
    };
    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || anchorRef?.current?.contains(event.target)) return;
      onCloseRef.current({ returnFocus: false });
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [anchorRef]);

  const isGroup = group.items.length > 1;
  const [only] = group.items;
  const label = isGroup ? `${group.date} 기록 ${group.items.length}건` : `${group.date} ${only.kind === 'CONTRACT' ? only.title : only.log.title}`;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={{ left: `${percent}%` }}
      className={`absolute top-10 z-30 w-[320px] rounded-card border border-line bg-surface p-4 shadow-[0_12px_32px_rgba(21,32,28,0.16)] outline-none ${PLACEMENT_CLASS[placement]}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-num text-sub tabular-nums text-ink-3">{group.date}</span>
        {isGroup ? (
          <span className="text-sub font-semibold text-ink-2">
            기록 <span className="font-num tabular-nums">{group.items.length}</span>건
          </span>
        ) : (
          <>
            <TypeChip item={only} />
            {only.kind === 'LOG' && only.log.room && <RoomChip room={only.log.room} />}
          </>
        )}
        <button
          type="button"
          aria-label="작은 카드 닫기"
          onClick={() => onClose({ returnFocus: true })}
          className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      {isGroup ? (
        <ul className="mt-2 space-y-2">
          {group.items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 rounded-input bg-surface-2 p-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <TypeChip item={item} />
                  {item.kind === 'LOG' && item.log.scope === 'PRIVATE' && <PrivateChip />}
                </span>
                <span className="mt-1 block truncate text-body font-semibold text-ink">{item.kind === 'CONTRACT' ? item.title : item.log.title}</span>
                {item.kind === 'LOG' && item.log.isFromPreviousOwner && <span className="block text-sub text-ink-3">이전 소유자 기록 · 읽기 전용</span>}
              </span>
              <ActionButton item={item} onShowLog={onShowLog} onShowContract={onShowContract} />
            </li>
          ))}
        </ul>
      ) : (
        <>
          <SingleItem item={only} />
          <div className="mt-3 flex justify-end">
            <ActionButton item={only} onShowLog={onShowLog} onShowContract={onShowContract} />
          </div>
        </>
      )}
    </div>
  );
};

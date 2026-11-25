import { ArrowUpRight, CalendarClock, CalendarX, CheckCircle2, DoorOpen, KeyRound, ListChecks, MailWarning } from 'lucide-react';
import { IconTile } from '../IconTile/IconTile';
import { formatDday } from '../../utils/contract';

const ICON = {
  notice: MailWarning,
  end: CalendarX,
  checklist: ListChecks,
  renewed: CheckCircle2,
  window: CalendarClock,
  moveOut: DoorOpen,
  moveIn: KeyRound,
};

// 줄 색(tone): crit 권장 마감 임박 · warn 주의 · ok 끝남 · seal 입주 · mute 보통 · later 아직 먼 일(흐리게 + "나중에")
const TONE = {
  crit: { row: 'bg-crit-box', tile: 'crit', title: 'text-crit-ink', chip: 'bg-crit text-white' },
  warn: { row: 'bg-warn-soft/50', tile: 'warn', title: 'text-warn-ink', chip: 'bg-warn text-white' },
  ok: { row: 'bg-ok-soft/40', tile: 'ok', title: 'text-ok-ink', chip: 'bg-surface-2 text-ink-2' },
  seal: { row: '', tile: 'seal', title: 'text-ink', chip: 'bg-surface-2 text-ink-2' },
  mute: { row: '', tile: 'mute', title: 'text-ink', chip: 'bg-surface-2 text-ink-2' },
  later: { row: 'text-ink-3', tile: 'mute', title: 'text-ink-3', chip: 'bg-surface-2 text-ink-2' },
};

// 앞으로 할 일 카드(U-16). items: utils buildTodoItems 결과. 할 일이 없으면 그리지 않는다.
// 버튼은 계약 쪽으로 가는 링크뿐(H-23·H-38): onAction(action) — action.kind NOTICE·CONTRACT·RENEW.
// 퇴거 점검·입주 인수인계는 누를 곳 없는 알림 문구(H-42).
export const HouseLogTodo = ({ items = [], onAction }) => {
  if (items.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface" aria-label="앞으로 할 일">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-card-sm font-semibold text-ink">앞으로 할 일</h2>
        <p className="text-sub text-ink-3">계약 날짜로 자동 계산</p>
      </div>
      <ul>
        {items.map((item) => {
          const tone = TONE[item.tone] ?? TONE.mute;
          return (
            <li key={item.id} className={`flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0 ${tone.row}`}>
              <IconTile icon={ICON[item.icon] ?? CalendarClock} tone={tone.tile} />
              <div className="min-w-0 flex-1">
                <p className={`text-card-sm font-semibold ${tone.title}`}>{item.title}</p>
                <p className="mt-0.5 text-sub text-ink-2">{item.description}</p>
              </div>
              {item.tone === 'later' ? (
                <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-chip font-semibold text-ink-2">나중에</span>
              ) : (
                item.dday != null && (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 font-num text-chip font-semibold tabular-nums ${tone.chip}`}>{formatDday(item.dday)}</span>
                )
              )}
              {item.action && (
                <button
                  type="button"
                  onClick={() => onAction(item.action)}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-btn border border-line bg-surface px-4 text-body font-semibold text-ink hover:bg-surface-2"
                >
                  {item.action.label}
                  <ArrowUpRight size={16} className="text-ink-3" aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

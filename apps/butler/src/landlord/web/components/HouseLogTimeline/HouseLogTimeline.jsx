import { useRef, useState } from 'react';
import { Badge } from '@butler/ui';
import { AlertTriangle, ArrowRight, CalendarRange, Check } from 'lucide-react';
import { TimelinePopover } from '../TimelinePopover/TimelinePopover';
import { daysBetween, formatDday } from '../../utils/contract';
import { getLogTypeLabel } from '../../utils/managementLog';
import {
  computeTicks,
  getContractYears,
  getElapsedPercent,
  getPastBarEnd,
  getPopoverPlacement,
  getTimelineStatus,
  toPercent,
} from '../../utils/houseLogTimeline';

// 점 색(시안): 수리·수리 요청 완료 초록, 점검 회색, 메모 주황, 계약·통지 남색.
export const DOT_COLOR_CLASS = { REPAIR: 'bg-accent', TICKET_SUMMARY: 'bg-accent', INSPECTION: 'bg-ink-3', NOTE: 'bg-warn', CONTRACT: 'bg-seal' };
export const dotColorOf = (item) => DOT_COLOR_CLASS[item.kind === 'CONTRACT' ? 'CONTRACT' : item.logType] ?? 'bg-ink-3';

// 통지 기간 빗금(warn 토큰, 다크 모드도 같은 변수).
const WINDOW_STYLE = {
  background: 'repeating-linear-gradient(135deg, rgb(var(--color-warn-soft)) 0 6px, rgb(var(--color-warn) / 0.28) 6px 12px)',
};
// 이전 소유 띠(회색 세로 줄무늬).
const BAND_STYLE = {
  background: 'repeating-linear-gradient(90deg, rgb(var(--color-ink-3) / 0.22) 0 10px, rgb(var(--color-ink-3) / 0.3) 10px 12px)',
};

const LegendDot = ({ className, children }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`h-3 w-3 rounded-full ${className}`} aria-hidden="true" />
    {children}
  </span>
);

const LegendBar = ({ className, style, children }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`h-3 w-5 rounded-[3px] ${className ?? ''}`} style={style} aria-hidden="true" />
    {children}
  </span>
);

const dotLabel = (group) => {
  if (group.items.length > 1) return `${group.date} 기록 ${group.items.length}건`;
  const [item] = group.items;
  return item.kind === 'CONTRACT' ? `${group.date} 계약·통지 ${item.title}` : `${group.date} ${getLogTypeLabel(item.logType)} ${item.log.title}`;
};

// 축 위·아래 이름표. align: 'center'(기본) · 'start'(왼쪽 끝에서 오른쪽으로) · 'end'(오른쪽 끝에서 왼쪽으로)
const ALIGN_CLASS = { center: '-translate-x-1/2 text-center', start: 'text-left', end: '-translate-x-full text-right' };
const Flag = ({ percent, align = 'center', className = '', top, children }) => (
  <div className={`absolute whitespace-nowrap text-sub leading-tight ${ALIGN_CLASS[align]} ${className}`} style={{ left: `${percent}%`, top }}>
    {children}
  </div>
);
const edgeAlign = (percent) => (percent < 6 ? 'start' : percent > 94 ? 'end' : 'center');

// 한 호실 계약 타임라인 카드(U-15, H-25~H-27·H-30·H-34·H-39).
// - 계약 막대(지난 부분 채움)·오늘 세로선·통지 기간 빗금·마감 빨간 선·기록·계약 점.
// - 지난 계약은 회색 막대, 계약이 없으면 회색 빈 상태 + [계약 등록], 갱신 계약은 초록 점선(통지 흐림), 새 임차인 계약은 파랑 점선 + 경계선.
// - 이전 소유 띠(band): 내 소유 시작 앞 회색 띠 "이전 소유 기간 · 집 이력 n건".
// - 점(같은 날은 묶음)을 누르면 작은 카드. 점은 Tab으로 닿는 버튼이다.
// props: axis, groups(groupDotsByDate 결과), current·next·nextKind·past(classifyContracts), band, today, endedOn·isSold(소유가 끝난 호실),
//        hiddenPastCount, propertyName, onShowLog(logId), onShowContract(contractId), onRegisterContract()
export const HouseLogTimeline = ({
  axis,
  groups = [],
  current,
  next,
  nextKind,
  past = [],
  band = null,
  today,
  endedOn = null,
  isSold = false,
  hiddenPastCount = 0,
  propertyName,
  onShowLog,
  onShowContract,
  onRegisterContract,
}) => {
  const [openKey, setOpenKey] = useState(null);
  const dotRefs = useRef(new Map());
  const anchorRef = useRef(null);

  const pct = (date) => toPercent(date, axis);
  const notice = current?.renewalNotice ?? null;
  const isRenewal = nextKind === 'RENEWAL';
  const status = endedOn ? null : getTimelineStatus({ current, nextKind, renewalNotice: notice });
  const daysToEnd = current ? formatDday(daysBetween(today, current.endDate)) : null;
  const ticks = computeTicks(axis);
  const showEmpty = !current && !endedOn;
  // 통지 기간은 계약 응답의 renewalNotice가 있을 때만(진행 중·시작 전 계약, 소유가 살아 있을 때).
  const noticeWindow = current && notice ? notice : null;

  const closePopover = ({ returnFocus }) => {
    const key = openKey;
    setOpenKey(null);
    if (returnFocus) dotRefs.current.get(key)?.focus();
  };
  const toggle = (key) => {
    anchorRef.current = dotRefs.current.get(key) ?? null;
    setOpenKey((prev) => (prev === key ? null : key));
  };
  const openGroup = groups.find((group) => group.key === openKey);

  let subtitle;
  if (endedOn) {
    subtitle = `${endedOn} ${isSold ? '매도' : '소유 끝남'} · 읽기 전용${past.length > 0 ? ` · 지난 계약 ${past.length}건` : ''}`;
  } else if (!current) {
    subtitle = `${propertyName ? `${propertyName} · ` : ''}진행 중인 계약 없음${past.length > 0 ? ` · 지난 계약 ${past.length}건` : ''}`;
  } else {
    const parts = [];
    if (band) parts.push(`${band.end} 소유 시작`);
    parts.push(`${past.length > 0 || band ? '지금 계약 ' : ''}${current.startDate} ~ ${current.endDate}`);
    if (current.startDate <= today) parts.push(`${getContractYears(current)}년 중 ${getElapsedPercent(current, today)}% 지남`);
    else parts.push('시작 전');
    if (current.tenantName) parts.push(`임차인 ${current.tenantName}`);
    if (past.length > 0) parts.push(`지난 계약 ${past.length}건`);
    subtitle = parts.join(' · ');
  }

  const currentStart = current ? pct(current.startDate) : 0;
  const currentEnd = current ? pct(current.endDate) : 0;
  const todayPercent = pct(today);
  const flagTop = '-46px';

  return (
    <section className="rounded-card border border-line bg-surface p-6" aria-label="계약 타임라인">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-section font-semibold text-ink">
            <CalendarRange size={18} className="text-accent" aria-hidden="true" />
            계약 타임라인
          </h2>
          <p className="mt-1 text-body text-ink-2">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status && (
            <Badge tone={status.tone} className="inline-flex items-center gap-1">
              {status.tone === 'warning' && <AlertTriangle size={13} aria-hidden="true" />}
              {status.tone === 'success' && <Check size={13} aria-hidden="true" />}
              {status.label}
            </Badge>
          )}
          {daysToEnd && (
            <Badge className="font-num tabular-nums">
              {next ? '지금 계약 ' : ''}만료 {daysToEnd}
            </Badge>
          )}
        </div>
      </div>

      <div className="relative mx-2 mb-16 mt-16" data-testid="timeline-axis">
        {/* 축 위 이름표: 통지 기간 시작·마감, 내 소유 시작, 이전 소유 기간 */}
        {noticeWindow && !isRenewal && (
          <>
            <Flag percent={pct(noticeWindow.windowStart)} top={flagTop} className="text-warn-ink">
              통지 기간 시작
              <br />
              <b className="font-num">{noticeWindow.windowStart.slice(5)}</b>
            </Flag>
            <Flag percent={pct(noticeWindow.deadline)} top={flagTop} align={pct(noticeWindow.deadline) > 90 ? 'end' : 'start'} className="pl-2 text-crit-ink">
              통지 마감
              <br />
              <b className="font-num">{noticeWindow.deadline.slice(5)}</b>
            </Flag>
          </>
        )}
        {band && (
          <>
            <Flag percent={pct(band.start) + (pct(band.end) - pct(band.start)) / 2} top={flagTop} className="text-ink-2">
              이전 소유 기간
              <br />
              <b>
                집 이력 <span className="font-num">{band.count}</span>건
              </b>
            </Flag>
            <Flag percent={pct(band.end)} top={flagTop} align="end" className="pr-2 text-ink">
              내 소유 시작
              <br />
              <b className="font-num">{band.end}</b>
            </Flag>
          </>
        )}

        <div className="relative h-3.5 rounded-full bg-line">
          {/* 이전 소유 띠 */}
          {band && (
            <div
              className="absolute -bottom-1 -top-1 rounded-l-full"
              style={{ ...BAND_STYLE, left: `${pct(band.start)}%`, width: `${pct(band.end) - pct(band.start)}%` }}
              data-testid="owner-band"
            />
          )}
          {/* 지난 계약: 회색 막대 */}
          {past.map((contract) => (
            <div
              key={contract.id}
              className="absolute inset-y-0 bg-ink-3/35"
              style={{ left: `${pct(contract.startDate)}%`, width: `${Math.max(0.5, pct(getPastBarEnd(contract)) - pct(contract.startDate))}%` }}
              data-testid="past-contract-bar"
            />
          ))}
          {/* 계약 없음: 회색 빈 상태 */}
          {showEmpty && <div className="absolute inset-0 rounded-full bg-ink-3/20" data-testid="empty-track" />}
          {/* 지금 계약: 바탕 + 지난 부분 채움 */}
          {current && (
            <div className="absolute inset-y-0 bg-accent-soft" style={{ left: `${currentStart}%`, width: `${currentEnd - currentStart}%` }} data-testid="current-contract-bar">
              {current.startDate < today && (
                <div className="absolute inset-y-0 left-0 bg-accent/35" style={{ width: `${Math.min(100, ((todayPercent - currentStart) / Math.max(0.01, currentEnd - currentStart)) * 100)}%` }} />
              )}
            </div>
          )}
          {/* 다음 계약: 갱신 초록 점선 / 새 임차인 파랑 점선 */}
          {next && (
            <div
              className={`absolute inset-y-0 right-0 rounded-r-full border-2 border-l-0 border-dashed ${isRenewal ? 'border-accent bg-ok-soft' : 'border-seal bg-seal-soft'}`}
              style={{ left: `${pct(next.startDate)}%` }}
              data-testid={isRenewal ? 'renewal-contract-bar' : 'new-tenant-contract-bar'}
            />
          )}
          {/* 계약이 바뀌는 곳(지난 계약 → 지금, 지금 → 새 임차인)의 세로선 */}
          {current && (past.length > 0 || band) && <div className="absolute -bottom-2 -top-2 -ml-px w-[3px] bg-ink" style={{ left: `${currentStart}%` }} />}
          {band && !current && <div className="absolute -bottom-3 -top-3 -ml-px w-[3px] bg-ink" style={{ left: `${pct(band.end)}%` }} />}
          {next && <div className="absolute -bottom-2 -top-2 -ml-px w-[3px] bg-ink" style={{ left: `${currentEnd}%` }} data-testid="contract-boundary" />}
          {endedOn && <div className="absolute -bottom-3 -top-3 -ml-px w-[3px] bg-ink" style={{ left: `${pct(endedOn)}%` }} />}
          {/* 통지 기간·마감(갱신 확정이면 흐리게) */}
          {noticeWindow && (
            <>
              <div
                className={`absolute -bottom-[3px] -top-[3px] rounded-md border-[1.5px] border-warn ${isRenewal ? 'opacity-30' : ''}`}
                style={{ ...WINDOW_STYLE, left: `${pct(noticeWindow.windowStart)}%`, width: `${pct(noticeWindow.deadline) - pct(noticeWindow.windowStart)}%` }}
                data-testid="notice-window"
              />
              <div className={`absolute -bottom-2.5 -top-2.5 w-[3px] rounded-sm bg-crit ${isRenewal ? 'opacity-30' : ''}`} style={{ left: `${pct(noticeWindow.deadline)}%` }} data-testid="notice-deadline" />
            </>
          )}

          {/* 점(같은 날은 묶음). 누르는 영역 40px, 보이는 점 16px. */}
          {groups.map((group) => {
            const isOpen = group.key === openKey;
            const [first] = group.items;
            const isFaded = (current && group.date < current.startDate) || first.isPast;
            return (
              <button
                key={group.key}
                type="button"
                ref={(node) => {
                  if (node) dotRefs.current.set(group.key, node);
                  else dotRefs.current.delete(group.key);
                }}
                aria-label={dotLabel(group)}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onClick={() => toggle(group.key)}
                className="group absolute top-1/2 z-10 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center rounded-full outline-none"
                style={{ left: `${pct(group.date)}%` }}
              >
                <span
                  className={`relative block h-4 w-4 rounded-full border-[2.5px] border-surface shadow-[0_0_0_1px_rgb(var(--color-ink-3)/0.45)] transition-transform group-hover:scale-125 group-focus-visible:outline group-focus-visible:outline-[3px] group-focus-visible:outline-offset-2 group-focus-visible:outline-accent ${dotColorOf(first)} ${
                    isOpen ? 'scale-[1.35] shadow-[0_0_0_2px_rgb(var(--color-ink))]' : ''
                  } ${isFaded && !isOpen ? 'opacity-60' : ''} ${first.kind === 'CONTRACT' && first.isPast ? 'shadow-[0_0_0_2px_rgb(var(--color-ink-3))]' : ''}`}
                />
                {group.items.length > 1 && (
                  <span className="absolute -right-0.5 -top-0.5 rounded-full bg-ink px-1 font-num text-[11px] font-bold leading-4 text-surface" aria-hidden="true">
                    {group.items.length}
                  </span>
                )}
              </button>
            );
          })}

          {/* 오늘 */}
          <div className="pointer-events-none absolute -bottom-3 -top-3 z-20 w-0.5 bg-ink" style={{ left: `${todayPercent}%` }} data-testid="today-line">
            <span
              className={`absolute -top-6 whitespace-nowrap rounded-md bg-ink px-2 text-chip font-bold text-surface ${
                todayPercent > 94 ? 'right-0' : todayPercent < 6 ? 'left-0' : 'left-1/2 -translate-x-1/2'
              }`}
            >
              오늘 {today.slice(5)}
            </span>
          </div>
        </div>

        {/* 계약 없음 안내 */}
        {showEmpty && (
          <div className="absolute -top-12 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface py-1 pl-4 pr-1 text-body text-ink-2">
            진행 중인 계약이 없어요
            <button type="button" onClick={onRegisterContract} className="inline-flex h-10 items-center gap-1 rounded-full px-3 font-semibold text-accent-strong hover:bg-accent-soft">
              계약 등록
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* 축 아래 눈금·계약 시작·만료 이름표 */}
        {ticks
          .filter((tick) => !current || (Math.abs(tick.percent - currentStart) > 6 && Math.abs(tick.percent - currentEnd) > 6))
          .map((tick) => (
            <Flag key={tick.date} percent={tick.percent} top="26px" className="font-num text-chip text-ink-3">
              {tick.label}
            </Flag>
          ))}
        {past.length > 0 && (
          <Flag percent={pct(past[0].startDate)} top="26px" align={edgeAlign(pct(past[0].startDate))} className="font-num text-chip text-ink-3">
            {hiddenPastCount > 0 ? `그 전 계약 ${hiddenPastCount}건` : '지난 계약'}
            <br />
            {past[0].startDate.slice(0, 7)}
          </Flag>
        )}
        {band?.olderCount > 0 && (
          <Flag percent={0} top="26px" align="start" className="text-chip text-ink-3">
            그 전 기록 <span className="font-num">{band.olderCount}</span>건
          </Flag>
        )}
        {current && (
          <>
            <Flag percent={currentStart} top="26px" align={edgeAlign(currentStart)} className="font-num text-chip text-ink-3">
              {past.length > 0 || band ? '지금 계약' : '계약 시작'}
              <br />
              {current.startDate.slice(0, 7)}
            </Flag>
            <Flag percent={currentEnd} top="26px" align={edgeAlign(currentEnd)} className="font-num text-chip text-ink-3">
              만료
              <br />
              {current.endDate.slice(0, 7)}
            </Flag>
          </>
        )}

        {openGroup && (
          <TimelinePopover
            group={openGroup}
            percent={pct(openGroup.date)}
            placement={getPopoverPlacement(pct(openGroup.date))}
            anchorRef={anchorRef}
            onClose={closePopover}
            onShowLog={(logId) => {
              setOpenKey(null);
              onShowLog(logId);
            }}
            onShowContract={onShowContract}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3 text-sub text-ink-2">
        {band && <LegendBar style={BAND_STYLE}>이전 소유 기간 — 넘겨받은 집 이력만(계약·임차인 정보 없음)</LegendBar>}
        <LegendDot className="bg-accent">수리</LegendDot>
        <LegendDot className="bg-ink-3">점검</LegendDot>
        <LegendDot className="bg-warn">메모</LegendDot>
        <LegendDot className="bg-seal">계약·통지</LegendDot>
        {past.length > 0 && <LegendBar className="bg-ink-3/35">지난 계약(버틀러에 등록된 것만)</LegendBar>}
        {noticeWindow && (
          <>
            <LegendBar className="border border-warn" style={WINDOW_STYLE}>
              갱신 거절 통지 기간(만료 6~2개월 전)
            </LegendBar>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-[3px] bg-crit" aria-hidden="true" />
              통지 마감
            </span>
          </>
        )}
        <span className="ml-auto text-ink-3">점을 누르면 그 기록이 작은 카드로 보여요</span>
      </div>
    </section>
  );
};

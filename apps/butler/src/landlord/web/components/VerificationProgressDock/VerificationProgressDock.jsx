// Created: 2026-11-19
// 화면 오른쪽 아래 권리자 인증 진행 표시. 호실 상세를 나가도 진행 중인 인증을 보여 주고, 누르면 그 호실 상세로 간다.
// 진행 중: 도는 링 + "권리자 인증 진행 중" / 끝남: 완료 · 실패 + 닫기(×). 보고 있는 호실 상세에서는 그 호실 것을 숨긴다(권리자 인증 카드가 보여 줌).
import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { MarqueeText } from '../MarqueeText/MarqueeText';
import { ProgressRing } from '../ProgressRing/ProgressRing';
import { useInProgressOwnershipVerifications } from '../../hooks/useInProgressOwnershipVerifications';

// 남색 연한 카드 위라 아이콘 칸은 흰 바탕으로 둔다(진행 링과 같은 모양).
const FINISHED_VIEW = {
  VERIFIED: { icon: ShieldCheck, iconClass: 'text-seal', title: '권리자 인증 완료' },
  FAILED: { icon: ShieldAlert, iconClass: 'text-crit', title: '권리자 인증 실패' },
};

const ResultIcon = ({ icon: Icon, iconClass }) => (
  <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-surface ${iconClass}`}>
    <Icon size={20} strokeWidth={1.8} />
  </span>
);

// 카드 바탕은 권리자 인증 안내 색(남색 연한 바탕, design.md §2-4)으로 눈에 띄게 한다. 테두리는 그대로 Line.
// 가로로 긴 한 줄: [링 · 아이콘] 제목 · 호실 이름 [×]. 호실 이름이 길면 전광판처럼 흘려 보낸다(MarqueeText). ×는 카드 오른쪽 끝에 작게 둔다.
// 카드 어디를 눌러도 호실 상세로 간다(키보드는 안쪽 버튼으로). ×는 카드 누름으로 번지지 않게 막는다.
// 화면 위에 떠 있게 보이도록(그림자는 쓰지 않음, design.md §4) 나타날 때 아래에서 살짝 올라온다.
const DockCard = ({ visual, title, propertyName, onOpen, onClose }) => {
  const [isShown, setIsShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      onClick={onOpen}
      className={`pointer-events-auto flex w-full max-w-md cursor-pointer items-center gap-1 rounded-card border border-seal bg-seal-soft py-2 pl-3 pr-2 transition duration-300 ease-out motion-reduce:transition-none ${
        isShown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
    >
      <button type="button" className="flex min-h-11 min-w-0 items-center gap-3 text-left">
        {visual}
        <span className="shrink-0 text-body font-semibold text-seal-ink">{title}</span>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-seal-ink/30" />
        <MarqueeText text={propertyName} className="text-body text-seal-ink" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label={`${propertyName} 알림 닫기`}
        // 누르는 영역은 44px, 보이는 흰 칸은 작게. 커서를 올리면(또는 키보드 초점) 남색 칸 + 흰 ×로 바뀐다.
        className="group ml-auto flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-chip bg-surface text-seal-ink transition-colors group-hover:bg-seal group-hover:text-white group-focus-visible:bg-seal group-focus-visible:text-white">
          <X size={12} aria-hidden="true" />
        </span>
      </button>
    </div>
  );
};

const MAX_VISIBLE_CARDS = 3;

// 묶인 카드 수 안내(진행 중 · 끝남 건수) + 펼치기 · 접기. 다른 카드와 구분되게 흰 바탕이다.
const GroupCard = ({ isExpanded, runningCount, finishedCount, onToggle }) => {
  const total = runningCount + finishedCount;
  const detail = [runningCount > 0 && `진행 중 ${runningCount}`, finishedCount > 0 && `끝남 ${finishedCount}`].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      className="pointer-events-auto flex min-h-11 w-full max-w-md items-center justify-between gap-3 rounded-card border border-seal bg-surface px-4 py-2 text-left hover:bg-seal-soft"
    >
      <span className="text-body font-semibold text-seal-ink">
        {isExpanded ? '접기' : (
          <>
            권리자 인증 <span className="font-num tabular-nums">{total}</span>건 더 보기
          </>
        )}
      </span>
      {!isExpanded && <span className="text-sub text-seal-ink">{detail}</span>}
    </button>
  );
};

// currentPropertyId: 지금 보고 있는 호실 상세(없으면 undefined). refreshKey: 화면이 바뀔 때마다 다시 읽게 넘기는 값(경로)
// 오른쪽 아래 대화 팝업과 겹치지 않게 비킨다(docs/19 11-4). open: 1024 이상에서 팝업(380) + 여백(24) + 간격(24) 왼쪽,
// collapsed: 접힘 막대(bottom-6 · 높이 56) 위로 16px. 1024 미만 오른쪽 패널이 열리면 가려져도 된다.
const CHAT_DOCK_POSITION = {
  none: 'bottom-8 right-8',
  open: 'bottom-8 right-8 lg:right-[428px]',
  collapsed: 'bottom-24 right-8',
};
export const chatDockPositionClass = (chatDock) => CHAT_DOCK_POSITION[chatDock] ?? CHAT_DOCK_POSITION.none;

// chatDock: 대화 팝업 상태('none'|'open'|'collapsed').
export const VerificationProgressDock = ({ currentPropertyId, refreshKey, onNavigate, onUnauthorized, chatDock = 'none' }) => {
  const { running, finished, dismiss } = useInProgressOwnershipVerifications({ refreshKey, onUnauthorized });
  // 진행 중 카드를 ×로 끈 호실. 그 호실 상세에 다시 들어가면 풀려서, 상세를 나가면 다시 보인다.
  const [hiddenPropertyIds, setHiddenPropertyIds] = useState(() => new Set());
  // 결과를 그 호실 상세에서 이미 봤으면(권리자 인증 카드) 나간 뒤 다시 띄우지 않는다.
  useEffect(() => {
    finished.filter(({ property }) => property.id === currentPropertyId).forEach(({ attempt }) => dismiss(attempt.id));
  }, [finished, currentPropertyId, dismiss]);
  useEffect(() => {
    if (!currentPropertyId) return;
    setHiddenPropertyIds((prev) => {
      if (!prev.has(currentPropertyId)) return prev;
      const next = new Set(prev);
      next.delete(currentPropertyId);
      return next;
    });
  }, [currentPropertyId]);
  const hideRunning = (propertyId) => setHiddenPropertyIds((prev) => new Set(prev).add(propertyId));

  // 4장 이상이면 3장만 보이고 나머지는 "N건 더 보기"로 묶는다. 누르면 모두 펼친다.
  const [isExpanded, setIsExpanded] = useState(false);

  const isOther = ({ property }) => property.id !== currentPropertyId;
  const visibleRunning = running.filter((item) => isOther(item) && !hiddenPropertyIds.has(item.property.id));
  const visibleFinished = finished.filter(isOther);

  const open = (propertyId) => onNavigate('propertyDetail', { propertyId });
  // 위에서 아래로: 끝난 카드 → 진행 중 카드
  const cards = [
    ...visibleFinished.map(({ attempt, property }) => {
      const view = FINISHED_VIEW[attempt.status] ?? FINISHED_VIEW.FAILED;
      return {
        key: attempt.id,
        isRunning: false,
        visual: <ResultIcon icon={view.icon} iconClass={view.iconClass} />,
        title: view.title,
        propertyName: property.displayName,
        onOpen: () => {
          dismiss(attempt.id);
          open(property.id);
        },
        onClose: () => dismiss(attempt.id),
      };
    }),
    ...visibleRunning.map((item) => ({
      key: item.id,
      isRunning: true,
      visual: <ProgressRing surface="surface" label="권리자 인증 진행 중" />,
      title: '권리자 인증 진행 중',
      propertyName: item.property.displayName,
      onOpen: () => open(item.property.id),
      onClose: () => hideRunning(item.property.id),
    })),
  ];
  if (cards.length === 0) return null;

  const isGrouped = cards.length > MAX_VISIBLE_CARDS;
  const shownCards = isGrouped && !isExpanded ? cards.slice(0, MAX_VISIBLE_CARDS) : cards;
  const groupedCards = cards.slice(MAX_VISIBLE_CARDS);

  return (
    // 폭을 정해 두려고 왼쪽 끝까지 펼치되, 빈 곳은 아래 화면을 누를 수 있게 둔다(pointer-events-none).
    <aside aria-label="권리자 인증 진행" className={`pointer-events-none fixed left-8 z-20 flex flex-col items-end gap-2 ${chatDockPositionClass(chatDock)}`}>
      {shownCards.map(({ key, ...card }) => (
        <DockCard key={key} {...card} />
      ))}
      {isGrouped && (
        <GroupCard
          isExpanded={isExpanded}
          runningCount={groupedCards.filter((card) => card.isRunning).length}
          finishedCount={groupedCards.filter((card) => !card.isRunning).length}
          onToggle={() => setIsExpanded((prev) => !prev)}
        />
      )}
    </aside>
  );
};

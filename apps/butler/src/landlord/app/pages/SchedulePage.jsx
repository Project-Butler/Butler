import { useState } from 'react';
import { Bell, CalendarCheck, ChevronLeft, ChevronRight, FileWarning, Wallet } from 'lucide-react';
import { Badge, MobileFormLayout } from '@butler/ui';
import { useNavigate } from 'react-router-dom';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { addDays, formatDday, formatManwon, getDdayTone, getTodayKST } from '../../web/utils/contract';
import { Switch } from '../components/Switch/Switch';
import { UnderlineTabs } from '../components/UnderlineTabs/UnderlineTabs';
import { useGetScheduleList } from '../hooks/useGetScheduleList';
import { useNotificationList } from '../../../shared/notifications/useNotificationList';
import { useNotificationPreference } from '../hooks/useNotificationPreference';
import { useNotificationUnreadCount } from '../../../shared/notifications/useNotificationUnreadCount';
import { useGoBack, useGoTo } from '../utils/navigation';
import { formatNotificationTime } from '../../../shared/notifications/formatNotificationTime';
import {
  formatScheduleDate,
  formatWeekMonthLabel,
  getDayOfMonth,
  getDaysUntil,
  getWeekDates,
  isToggleOn,
  NOTIFICATION_TOGGLES,
  setToggle,
  toLandlordPath,
  UPCOMING_DAYS,
  WEEKDAY_LABELS,
} from '../utils/scheduleView';

const CARD_CLASS = 'rounded-card border border-line bg-surface';
const SECTION_TITLE = 'text-m-card font-semibold text-ink';

const KIND_ICONS = {
  CONTRACT_END: { Icon: CalendarCheck, className: 'bg-accent-soft text-accent-strong' },
  RENT_PAYMENT: { Icon: Wallet, className: 'bg-ok-soft text-ok-ink' },
  RENEWAL_NOTICE_DEADLINE: { Icon: FileWarning, className: 'bg-warn-soft text-warn-ink' },
};

const Loading = () => (
  <p role="status" className="py-6 text-center text-body text-ink-3">
    불러오는 중입니다
  </p>
);

// 주 띠: 월 이름 · 지난 주/다음 주 · 7일. 일정이 있는 날은 점을 찍고, 누르면 그날 일정만 본다(다시 누르면 전체).
const WeekStrip = ({ today, weekDates, datesWithItems, selectedDate, onSelect, onMove, onToday }) => {
  const isThisWeek = weekDates.includes(today);
  return (
    <section aria-label="주간 달력" className={`${CARD_CLASS} flex flex-col gap-3 px-3 pb-3 pt-2`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="지난 주" onClick={() => onMove(-7)} className="flex h-11 w-11 items-center justify-center rounded-input text-ink-2">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2">
          <h2 className={SECTION_TITLE}>{formatWeekMonthLabel(weekDates)}</h2>
          {!isThisWeek && (
            <button type="button" onClick={onToday} className="rounded-chip border border-line px-2 py-0.5 text-m-chip text-ink-2">
              오늘
            </button>
          )}
        </div>
        <button type="button" aria-label="다음 주" onClick={() => onMove(7)} className="flex h-11 w-11 items-center justify-center rounded-input text-ink-2">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {weekDates.map((date, index) => {
          const count = datesWithItems.get(date) ?? 0;
          const isSelected = date === selectedDate;
          const isToday = date === today;
          return (
            <li key={date} className="flex flex-col items-center gap-1">
              <span aria-hidden="true" className={`text-m-chip ${index === 0 ? 'text-crit-ink' : 'text-ink-3'}`}>
                {WEEKDAY_LABELS[index]}
              </span>
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`${formatScheduleDate(date)}${isToday ? ', 오늘' : ''}${count ? `, 일정 ${count}개` : ''}`}
                onClick={() => onSelect(isSelected ? null : date)}
                className={`flex h-10 w-10 items-center justify-center rounded-full font-num text-body tabular-nums ${
                  isSelected ? 'bg-accent font-semibold text-white' : isToday ? 'border border-accent font-semibold text-accent-strong' : 'text-ink'
                }`}
              >
                {getDayOfMonth(date)}
              </button>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${count ? 'bg-accent' : 'bg-transparent'}`} />
            </li>
          );
        })}
      </ol>
    </section>
  );
};

const ScheduleRow = ({ item, today, onOpen }) => {
  const { Icon, className } = KIND_ICONS[item.kind] ?? KIND_ICONS.CONTRACT_END;
  const days = getDaysUntil(today, item.date);
  const amount = item.amount != null ? formatManwon(item.amount) : null;
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 border-b border-line py-3 text-left last:border-b-0">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${className}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium text-ink">{item.title}</span>
          {/* 호실 이름은 길어도 호수까지 보이게 자르지 않고 줄을 바꾼다. */}
          {item.property?.displayName && <span className="block break-keep text-m-sub text-ink-2">{item.property.displayName}</span>}
          <span className="block text-m-sub text-ink-3">
            {formatScheduleDate(item.date)}
            {amount && <span className="font-num tabular-nums"> · {amount}</span>}
          </span>
        </span>
        <Badge tone={getDdayTone(days)} className="shrink-0 rounded-chip font-num tabular-nums">
          {formatDday(days)}
        </Badge>
      </button>
    </li>
  );
};

const ScheduleList = ({ title, action, items, error, isLoading, today, emptyText, onOpen }) => (
  <section aria-label={title} className={`${CARD_CLASS} flex flex-col px-4 pt-4`}>
    <div className="flex items-center justify-between gap-2 pb-1">
      <h2 className={SECTION_TITLE}>{title}</h2>
      {action}
    </div>
    {error && <NoticeBox className="mb-4">{error.message}</NoticeBox>}
    {!error && isLoading && <Loading />}
    {!error && !isLoading && items.length === 0 && <p className="pb-5 pt-3 text-body text-ink-3">{emptyText}</p>}
    {!error && !isLoading && items.length > 0 && (
      <ul>
        {items.map((item) => (
          <ScheduleRow key={item.id} item={item} today={today} onOpen={() => onOpen(item)} />
        ))}
      </ul>
    )}
  </section>
);

const PreferenceCard = ({ onUnauthorized }) => {
  const { data, error, isLoading, saveError, updateMutedTypes } = useNotificationPreference({ onUnauthorized });
  return (
    <section aria-label="알림 받기" className={`${CARD_CLASS} flex flex-col px-4 pt-4`}>
      <h2 className={`${SECTION_TITLE} pb-1`}>알림 받기</h2>
      {error && <NoticeBox className="mb-4">{error.message}</NoticeBox>}
      {!error && isLoading && <Loading />}
      {data && (
        <ul>
          {NOTIFICATION_TOGGLES.map((toggle) => (
            <li key={toggle.key} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
              <span className="min-w-0">
                <span className="block text-body text-ink">{toggle.label}</span>
                <span className="block text-m-sub text-ink-3">{toggle.description}</span>
              </span>
              <Switch
                label={`${toggle.label} 알림`}
                checked={isToggleOn(data.mutedTypes, toggle.types)}
                onChange={(on) => updateMutedTypes(setToggle(data.mutedTypes, toggle.types, on))}
              />
            </li>
          ))}
        </ul>
      )}
      {saveError && <NoticeBox className="mb-4">{saveError.message}</NoticeBox>}
    </section>
  );
};

const SchedulePanel = ({ onUnauthorized }) => {
  const goTo = useGoTo();
  const [today] = useState(getTodayKST);
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [selectedDate, setSelectedDate] = useState(null);
  const weekDates = getWeekDates(weekAnchor);

  const week = useGetScheduleList({ fromDate: weekDates[0], toDate: weekDates[6] }, { onUnauthorized });
  const upcoming = useGetScheduleList({ fromDate: today, toDate: addDays(today, UPCOMING_DAYS - 1) }, { onUnauthorized });

  const datesWithItems = new Map();
  for (const item of week.data ?? []) datesWithItems.set(item.date, (datesWithItems.get(item.date) ?? 0) + 1);

  const moveWeek = (days) => {
    setWeekAnchor((anchor) => addDays(anchor, days));
    setSelectedDate(null);
  };
  const openSchedule = (item) => {
    if (item.related?.resourceType === 'CONTRACT') goTo('contractDetail', { contractId: item.related.resourceId });
  };

  const list = selectedDate
    ? {
        title: `${formatScheduleDate(selectedDate)} 일정`,
        items: (week.data ?? []).filter((item) => item.date === selectedDate),
        error: week.error,
        isLoading: week.isLoading,
        emptyText: '이날은 일정이 없어요.',
      }
    : {
        title: '예정 일정',
        items: upcoming.data ?? [],
        error: upcoming.error,
        isLoading: upcoming.isLoading,
        emptyText: `앞으로 ${UPCOMING_DAYS}일 동안 일정이 없어요.`,
      };

  return (
    <>
      <WeekStrip
        today={today}
        weekDates={weekDates}
        datesWithItems={datesWithItems}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        onMove={moveWeek}
        onToday={() => {
          setWeekAnchor(today);
          setSelectedDate(null);
        }}
      />
      <ScheduleList
        {...list}
        today={today}
        onOpen={openSchedule}
        action={
          selectedDate ? (
            <button type="button" onClick={() => setSelectedDate(null)} className="py-2 text-m-sub text-ink-3 underline">
              전체 보기
            </button>
          ) : (
            <span className="text-m-sub text-ink-3">앞으로 {UPCOMING_DAYS}일</span>
          )
        }
      />
      <PreferenceCard onUnauthorized={onUnauthorized} />
    </>
  );
};

const NotificationPanel = ({ notifications }) => {
  const navigate = useNavigate();
  const { items, error, isLoading, hasNext, unreadCount, actionError, loadMore, markRead, markAllRead } = notifications;

  const open = (notification) => {
    markRead(notification.id);
    const path = toLandlordPath(notification.link);
    if (path) navigate(path);
  };

  return (
    <section aria-label="알림" className={`${CARD_CLASS} flex flex-col px-4 pt-4`}>
      <div className="flex items-center justify-between gap-2 pb-1">
        <h2 className={SECTION_TITLE}>받은 알림</h2>
        <button type="button" disabled={unreadCount === 0} onClick={markAllRead} className="py-2 text-m-sub text-ink-3 underline disabled:no-underline disabled:opacity-50">
          모두 읽음
        </button>
      </div>
      {actionError && <NoticeBox className="mb-3">{actionError.message}</NoticeBox>}
      {error && <NoticeBox className="mb-4">{error.message}</NoticeBox>}
      {!items && !error && isLoading && <Loading />}
      {items && items.length === 0 && <p className="pb-5 pt-3 text-body text-ink-3">아직 받은 알림이 없어요.</p>}
      {items && items.length > 0 && (
        <ul>
          {items.map((notification) => (
            <li key={notification.id}>
              <button type="button" onClick={() => open(notification)} className="flex w-full items-start gap-3 border-b border-line py-3 text-left">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${notification.readAt ? 'bg-surface-2 text-ink-3' : 'bg-accent-soft text-accent-strong'}`}>
                  <Bell size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-body ${notification.readAt ? 'text-ink-2' : 'font-semibold text-ink'}`}>
                    {!notification.readAt && <span className="sr-only">안 읽음, </span>}
                    {notification.title}
                  </span>
                  {notification.body && <span className="block text-m-sub text-ink-3">{notification.body}</span>}
                  <span className="block text-m-sub text-ink-3">{formatNotificationTime(notification.createdAt)}</span>
                </span>
                {!notification.readAt && <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-crit" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasNext && (
        <button type="button" disabled={isLoading} onClick={loadMore} className="py-3 text-body text-ink-2 disabled:opacity-50">
          {isLoading ? '불러오는 중' : '더 보기'}
        </button>
      )}
      {items && !hasNext && <div className="pb-1" />}
    </section>
  );
};

// 임대인 앱 일정·알림(#163). 탭: 일정(주 띠 · 예정 일정 · 알림 받기) / 알림 N(안 읽은 수).
// 일정은 계약에서 계산한 SYSTEM 일정(만기·월세 입금일·갱신 거절 통지 마감)이고, 누르면 그 계약으로 간다.
// 탭은 주소(?tab=notifications)에 남긴다. 하단 탭 없이 뒤로 가기 상단 바를 쓴다.
export const SchedulePage = ({ tab, onUnauthorized }) => {
  const goTo = useGoTo();
  const goBack = useGoBack('home');
  const initialUnreadCount = useNotificationUnreadCount({ onUnauthorized });
  const notifications = useNotificationList({ initialUnreadCount, onUnauthorized });
  const { unreadCount } = notifications;

  const options = [
    { value: 'schedules', label: '일정' },
    { value: 'notifications', label: unreadCount > 0 ? `알림 ${unreadCount}` : '알림' },
  ];

  return (
    <MobileFormLayout shell="landlord-app-detail" topBar={{ title: '일정·알림', onBack: goBack }}>
      <UnderlineTabs
        ariaLabel="일정·알림"
        idPrefix="schedules"
        options={options}
        value={tab}
        onChange={(next) => goTo('schedules', { tab: next }, { replace: true })}
      />
      <div id="schedules-panel" role="tabpanel" aria-labelledby={`schedules-tab-${tab}`} className="flex flex-col gap-4">
        {tab === 'notifications' ? <NotificationPanel notifications={notifications} /> : <SchedulePanel onUnauthorized={onUnauthorized} />}
      </div>
    </MobileFormLayout>
  );
};

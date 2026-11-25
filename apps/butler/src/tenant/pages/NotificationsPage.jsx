import { useLocation, useNavigate } from 'react-router-dom';
import { Button, MobileShell } from '@butler/ui';
import { Bell } from 'lucide-react';
import { formatNotificationTime } from '../../shared/notifications/formatNotificationTime';
import { useNotificationList } from '../../shared/notifications/useNotificationList';
import { useNotificationUnreadCount } from '../../shared/notifications/useNotificationUnreadCount';
import { useTenantTabs } from '../hooks/useTenantTabs';
import { HOME_PATH, toTenantPath } from '../routes';

// 임차인 알림 목록(시안 v2.2 ⑨, docs/10 D15). 위 막대 종으로 들어온다. 누르면 읽음 처리하고 그 화면(수리 요청 상세 등)으로 간다.
// 알림 받기 설정(끄기)은 이번 범위 밖이다.
export const NotificationsPage = ({ onUnauthorized }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = useTenantTabs();
  const initialUnreadCount = useNotificationUnreadCount({ onUnauthorized });
  const { items, error, isLoading, hasNext, unreadCount, actionError, loadMore, markRead, markAllRead } = useNotificationList({
    initialUnreadCount,
    onUnauthorized,
  });
  const goBack = () => (location.key === 'default' ? navigate(HOME_PATH, { replace: true }) : navigate(-1));

  const open = (notification) => {
    markRead(notification.id);
    const path = toTenantPath(notification.link);
    if (path) navigate(path);
  };

  return (
    <MobileShell shell="tenant" backBar={{ title: '알림', onBack: goBack }} tabs={tabs}>
      <section aria-label="알림" className="flex flex-col rounded-card border border-line bg-surface px-4 pt-4">
        <div className="flex items-center justify-between gap-2 pb-1">
          <h2 className="text-m-card font-semibold text-ink">받은 알림</h2>
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={markAllRead}
            className="py-2 text-m-sub text-ink-3 underline disabled:no-underline disabled:opacity-50"
          >
            모두 읽음
          </button>
        </div>
        {actionError && (
          <p role="alert" className="mb-3 text-m-sub text-crit-ink">
            {actionError.message}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 text-m-sub text-crit-ink">
            {error.message}
          </p>
        )}
        {!items && !error && isLoading && (
          <p role="status" className="pb-5 pt-3 text-body text-ink-3">
            알림을 불러오는 중이에요
          </p>
        )}
        {items && items.length === 0 && <p className="pb-5 pt-3 text-body text-ink-3">아직 받은 알림이 없어요.</p>}
        {items && items.length > 0 && (
          <ul>
            {items.map((notification, index) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => open(notification)}
                  className={`flex w-full items-start gap-3 py-3 text-left ${index < items.length - 1 || hasNext ? 'border-b border-line' : ''}`}
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${notification.readAt ? 'bg-surface-2 text-ink-3' : 'bg-accent-soft text-accent-strong'}`}
                  >
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
          <Button variant="secondary" size="h44" disabled={isLoading} onClick={loadMore} className="mb-4">
            {isLoading ? '불러오는 중' : '더 보기'}
          </Button>
        )}
      </section>
    </MobileShell>
  );
};

// PC 위 막대 종 목록(@butler/ui NotificationMenu items) 계산. 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
import { formatNotificationTime } from '../../../shared/notifications/formatNotificationTime';
import { BASE_PATH } from '../routes';

// 알림 link('/tickets/:id')는 역할 접두어 없는 앱 경로다(계약 7장). 임대인 화면 주소로 바꾼다. 앱 밖 주소·'//'는 열지 않는다(null).
export const toLandlordWebPath = (link) => {
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//')) return null;
  return link.startsWith(`${BASE_PATH}/`) ? link : `${BASE_PATH}${link}`;
};

// 안 읽은 서버 알림(수리 요청 등)을 위에, 갱신 거절 통지(renewal.items)를 아래에 둔다.
// 서버 알림을 누르면 읽음 처리(onRead)하고 그 화면으로 간다(onOpenPath). 빈 목록이면 종에 빨간 점이 없다.
export const buildNotificationMenu = ({ unread = [], renewal, now = new Date(), onRead, onOpenPath }) => ({
  emptyText: renewal.emptyText,
  footer: renewal.footer,
  items: [
    ...unread.map((notification) => ({
      id: `n-${notification.id}`,
      title: notification.title,
      description: [notification.body, formatNotificationTime(notification.createdAt, now)].filter(Boolean).join(' · '),
      onClick: () => {
        onRead(notification.id);
        const path = toLandlordWebPath(notification.link);
        if (path) onOpenPath(path);
      },
    })),
    ...renewal.items,
  ],
});

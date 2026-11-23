import { Badge } from '@butler/ui';
import { TriangleAlert } from 'lucide-react';
import { getTicketStatusBadge } from '../../../app/utils/ticketView';
import { useGetTicketList } from '../../hooks/useGetTicketList';
import { formatDateKST } from '../../utils/format';
import { UNVERIFIED_LOG_WARNING } from '../../utils/managementLog';
import { getRoomLabel } from '../../utils/room';
import { NoticeBox } from '../NoticeBox/NoticeBox';

const IN_PROGRESS_STATUS = 'OPEN,IN_PROGRESS';

// 매도 종료 때 처리 중인 유지보수 요청 경고(H-32). 막지 않고, 0건·불러오는 중·오류면 아무것도 보이지 않는다.
// 행은 링크가 아니다(PC 수리·점검 화면이 없다).
const SoldTicketWarning = ({ propertyId, onUnauthorized }) => {
  const { data } = useGetTicketList({ propertyId, status: IN_PROGRESS_STATUS, size: 50 }, { onUnauthorized });
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  const total = data.meta?.total ?? items.length;

  return (
    <div role="alert" className="rounded-input bg-warn-soft px-4 py-3 text-body text-warn-ink">
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0" />
        처리 중인 유지보수 요청 {total}건은 새 임대인에게 넘어가지 않아요
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((ticket) => {
          const badge = getTicketStatusBadge(ticket.status);
          return (
            <li key={ticket.id} className="flex items-center gap-2 text-sub">
              <Badge tone={badge.tone} className="shrink-0">
                {badge.label}
              </Badge>
              <span className="min-w-0 flex-1 truncate">
                {ticket.title}
                {getRoomLabel(ticket.room) ? ` · ${getRoomLabel(ticket.room)}` : ''}
              </span>
              <span className="shrink-0 font-num tabular-nums">{formatDateKST(ticket.createdAt)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sub">
        매도하면 이 요청은 멈추고 읽기 전용이 돼요. 수리를 마쳤다면 완료로 바꿔 두세요 — 완료된 요청은 요약(수리 내용·비용)으로 집 이력에 남아 새 임대인에게 넘어가요. 아직이라면 상황을 메모로
        남겨 두면 넘어가요.
      </p>
    </div>
  );
};

// 호실 삭제(소유 관계 종료) 확인 패널의 안내: 매도 경고 + 인증 전 기록 사라짐 안내.
export const OwnershipEndNotices = ({ propertyId, isSold, isUnverified, onUnauthorized }) => (
  <>
    {isSold && <SoldTicketWarning propertyId={propertyId} onUnauthorized={onUnauthorized} />}
    {isUnverified && <NoticeBox tone="warn">{UNVERIFIED_LOG_WARNING}</NoticeBox>}
  </>
);

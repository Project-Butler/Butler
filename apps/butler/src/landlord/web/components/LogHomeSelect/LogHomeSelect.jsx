import { Badge, PageSkeleton } from '@butler/ui';
import { Building2, Check, Wrench } from 'lucide-react';
import { IconTile } from '../IconTile/IconTile';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { RoomChip } from '../RoomChip/RoomChip';
import { useGetManagementLogList } from '../../hooks/useGetManagementLogList';
import { useGetTicketList } from '../../hooks/useGetTicketList';
import { getTodayKST } from '../../utils/contract';
import { formatLogDate } from '../../utils/managementLog';
import { formatUnitLabel } from '../../utils/unitAddress';

// 진행 중 수리 요청은 한 번에 받는다(H-06). 호실 2~5개라 100건 넘는 hasNext는 일부러 무시한다.
const OPEN_TICKET_SIZE = 100;
const OPEN_TICKET_STATUS = 'OPEN,IN_PROGRESS';
const TICKET_STATUS_BADGE = { OPEN: { label: '확인 필요', tone: 'warning' }, IN_PROGRESS: { label: '처리 중', tone: 'pending' } };
const TH = 'whitespace-nowrap px-5 py-3 text-left text-sub font-semibold text-ink-2';

// 집 카드: 이름·주소, 진행 중 수리 요청 수, 최근 기록 한 줄(오늘까지, 미래 예정 제외).
const HomeCard = ({ property, openCount, today, onOpen, onUnauthorized }) => {
  const latest = useGetManagementLogList({ propertyId: property.id, until: today, size: 1 }, { onUnauthorized });
  const latestLog = latest.data?.items[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 text-left transition-colors hover:border-accent focus-visible:border-accent focus-visible:outline-none"
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block break-keep text-card font-bold text-ink">{property.displayName}</span>
          {property.complex?.roadAddress && <span className="mt-0.5 block truncate text-sub text-ink-3">{property.complex.roadAddress}</span>}
        </span>
        <IconTile icon={Building2} tone="accent" />
      </span>
      <span className="flex flex-wrap gap-1.5">
        {openCount > 0 ? (
          <Badge tone="verified">
            <Wrench size={13} className="-mt-0.5 mr-1 inline-block" aria-hidden="true" />
            진행 중 수리 요청 <span className="font-num tabular-nums">{openCount}</span>
          </Badge>
        ) : (
          <Badge tone="success">
            <Check size={13} className="-mt-0.5 mr-1 inline-block" aria-hidden="true" />
            처리할 일 없음
          </Badge>
        )}
      </span>
      <span className="block w-full truncate border-t border-line pt-3 text-sub text-ink-2">
        {latestLog ? (
          <>
            <span className="font-num tabular-nums text-ink-3">{formatLogDate(latestLog.occurredOn)}</span> · {latestLog.title}
          </>
        ) : (
          <span className="text-ink-3">{latest.data ? '아직 기록이 없어요' : latest.error ? '최근 기록을 불러오지 못했어요' : '불러오는 중'}</span>
        )}
      </span>
    </button>
  );
};

// 모든 집의 처리할 일: 진행 중 수리 요청(오래된 접수 순). PC 수리 요청 화면이 생기기 전까지는 누르지 않는다.
const OpenTicketTable = ({ tickets }) => (
  <table className="w-full text-body">
    <thead>
      <tr className="border-b border-line bg-surface-2">
        <th className={TH}>집</th>
        <th className={TH}>방</th>
        <th className={`${TH} w-full`}>수리 요청</th>
        <th className={TH}>상태</th>
        <th className={TH}>접수일</th>
      </tr>
    </thead>
    <tbody>
      {tickets.map((ticket) => {
        const status = TICKET_STATUS_BADGE[ticket.status] ?? { label: ticket.status, tone: 'default' };
        return (
          <tr key={ticket.id} className="border-b border-line last:border-b-0">
            <td className="whitespace-nowrap px-5 py-4 text-ink-2" title={ticket.property?.displayName}>
              {ticket.property ? formatUnitLabel(ticket.property.buildingNo, ticket.property.unitNo) : '—'}
            </td>
            <td className="px-5 py-4">
              <RoomChip room={ticket.room} />
            </td>
            <td className="px-5 py-4 font-semibold text-ink">{ticket.title}</td>
            <td className="whitespace-nowrap px-5 py-4">
              <Badge tone={status.tone}>{status.label}</Badge>
            </td>
            <td className="whitespace-nowrap px-5 py-4 font-num text-sub tabular-nums text-ink-3">{ticket.createdAt.slice(0, 10)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

// 하우스 로그 첫 화면의 집 선택(U-02, H-05~H-07). 활성 소유 호실이 2개 이상일 때만 쓴다.
// homes: GET /properties?relation=OWNER 결과(활성 소유만). 카드를 누르면 onSelectHome(propertyId).
export const LogHomeSelect = ({ homes, onSelectHome, onUnauthorized }) => {
  const today = getTodayKST();
  const ticketList = useGetTicketList({ status: OPEN_TICKET_STATUS, size: OPEN_TICKET_SIZE }, { onUnauthorized });
  const homeIds = new Set(homes.map((home) => home.id));
  // 소유가 끝난 호실의 요청(임대인이 직접 등록한 것 포함)은 뺀다. isReadOnly는 쓰지 않는다(H-06).
  const openTickets = (ticketList.data?.items ?? [])
    .filter((ticket) => homeIds.has(ticket.propertyId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const countByHome = openTickets.reduce((counts, ticket) => counts.set(ticket.propertyId, (counts.get(ticket.propertyId) ?? 0) + 1), new Map());
  // 진행 중 수리 요청이 많은 집부터(같으면 원래 순서).
  const sortedHomes = [...homes].sort((a, b) => (countByHome.get(b.id) ?? 0) - (countByHome.get(a.id) ?? 0));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {sortedHomes.map((home) => (
          <HomeCard
            key={home.id}
            property={home}
            openCount={countByHome.get(home.id) ?? 0}
            today={today}
            onOpen={() => onSelectHome(home.id)}
            onUnauthorized={onUnauthorized}
          />
        ))}
      </div>
      <section className="overflow-hidden rounded-card border border-line bg-surface" aria-label="모든 집의 처리할 일">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-card font-bold text-ink">
            모든 집의 처리할 일 {ticketList.data && <span className="font-num tabular-nums text-ink-3">{openTickets.length}</span>}
          </h2>
          <span className="text-sub text-ink-3">오래된 접수 순</span>
        </div>
        {ticketList.error && !ticketList.data ? (
          <NoticeBox className="m-5">{ticketList.error.message}</NoticeBox>
        ) : !ticketList.data ? (
          <PageSkeleton variant="list" rows={3} />
        ) : openTickets.length === 0 ? (
          <p className="py-8 text-center text-body text-ink-3">진행 중인 수리 요청이 없어요.</p>
        ) : (
          <OpenTicketTable tickets={openTickets} />
        )}
      </section>
    </div>
  );
};

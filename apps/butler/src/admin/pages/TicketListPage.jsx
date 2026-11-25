import { useSearchParams } from 'react-router-dom';
import { Badge, Card, Pagination, SegmentedControl } from '@butler/ui';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import { ROLE_LABEL, TICKET_STATUS_TONE } from '../constants/labels';
import { useGetAdminTicketList } from '../hooks/useGetAdminTicketList';
import { formatDateTime } from '../utils/formatDate';
import { getRoomLabel } from '../../shared/room';
import { getTicketCategoryLabel, getTicketStatusLabel, TICKET_CATEGORY_OPTIONS } from '../../shared/ticketLabels';

const PAGE_SIZE = 20;
const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  ...['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'].map((value) => ({ value, label: getTicketStatusLabel(value, 'ADMIN') })),
];
const CATEGORY_OPTIONS = [{ value: '', label: '전체' }, ...TICKET_CATEGORY_OPTIONS];

// 유지보수(수리·점검 요청) 목록. 읽기 전용 — 처리(상태·처리 메모·비용)는 그 호실의 활성 소유자만 한다(계약 5장).
// 상태·분류 필터와 쪽 번호는 URL 쿼리에 둔다(대시보드의 '요청 접수'가 ?status=OPEN으로 들어온다).
export const TicketListPage = ({ onNavigate, onUnauthorized }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const category = searchParams.get('category') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const { data, error, isLoading, refetch } = useGetAdminTicketList({ status, category, page, size: PAGE_SIZE }, { onUnauthorized });

  // 필터를 바꾸면 쪽 번호는 처음으로 돌린다.
  const updateParams = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries({ page: undefined, ...changes }).forEach(([key, value]) => {
      if (value) next.set(key, String(value));
      else next.delete(key);
    });
    setSearchParams(next);
  };

  const totalPages = data ? Math.ceil(data.meta.total / data.meta.size) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-h1 font-bold text-ink">유지보수</h2>
          <p className="mt-1 text-body text-ink-2">임차인·임대인이 올린 수리·점검 요청을 봅니다. 처리는 그 호실의 임대인이 합니다.</p>
        </div>
        {data && <span className="font-num text-body text-ink-3">총 {data.meta.total.toLocaleString('ko-KR')}건</span>}
      </div>

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
        <SegmentedControl
          ariaLabel="처리 상태"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(value) => updateParams({ status: value })}
          className="w-[30rem]"
        />
        <SegmentedControl
          ariaLabel="분류"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(value) => updateParams({ category: value })}
          className="w-[20rem]"
        />
      </Card>

      <Card className="overflow-hidden p-0">
        {error && (
          <StatusMessage tone="error" onRetry={refetch}>
            {error.message}
          </StatusMessage>
        )}
        {isLoading && !data && <StatusMessage>불러오는 중입니다</StatusMessage>}
        {data && data.items.length === 0 && <StatusMessage>조건에 맞는 요청이 없습니다.</StatusMessage>}
        {data && data.items.length > 0 && (
          <table className="w-full text-body">
            <thead>
              <tr className="border-y border-line text-left text-chip text-ink-3">
                <th className="px-5 py-2 font-medium">호실</th>
                <th className="px-3 py-2 font-medium">제목</th>
                <th className="px-3 py-2 font-medium">분류</th>
                <th className="px-3 py-2 font-medium">위치</th>
                <th className="px-3 py-2 font-medium">요청자</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-5 py-2 font-medium">접수</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((ticket) => (
                <tr key={ticket.id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-3 text-ink-2">{ticket.property?.displayName ?? '-'}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onNavigate('ticketDetail', { ticketId: ticket.id })}
                      className="text-left font-medium text-ink hover:underline"
                    >
                      {ticket.title}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-chip text-ink-2">{getTicketCategoryLabel(ticket.category)}</td>
                  <td className="px-3 py-3 text-chip text-ink-2">{getRoomLabel(ticket.room) ?? '-'}</td>
                  <td className="px-3 py-3 text-chip text-ink-2">
                    {ticket.requester?.name ?? '-'}
                    {ticket.requester?.role && <span className="block text-ink-3">{ROLE_LABEL[ticket.requester.role] ?? ticket.requester.role}</span>}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={TICKET_STATUS_TONE[ticket.status]}>{getTicketStatusLabel(ticket.status, 'ADMIN')}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-num text-chip text-ink-2">{formatDateTime(ticket.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Pagination page={page} totalPages={totalPages} onChange={(next) => updateParams({ page: next })} />
    </div>
  );
};

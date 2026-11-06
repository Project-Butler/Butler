import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Card, FilterChip } from '@butler/ui';
import { ManagementLogBadges } from '../components/ManagementLogBadges/ManagementLogBadges';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetManagementLogList } from '../hooks/useGetManagementLogList';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { formatAttachmentCount } from '../utils/attachment';
import { formatWon } from '../utils/contract';
import { TYPE_FILTER_OPTIONS } from '../utils/managementLog';

const PAGE_SIZE = 20;
// 호실 필터는 지금 소유한 호실과 소유가 끝난 호실 전부(목록 API 최대 크기)
const PROPERTY_PICKER_SIZE = 100;

// 한 필터 조합의 목록. 필터가 바뀌면 key로 새로 시작해 page가 1로 돌아간다.
const ManagementLogListSection = ({ propertyId, type, onNavigate, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetManagementLogList(
    { propertyId, type, page, size: PAGE_SIZE },
    { onUnauthorized },
  );
  const items = data?.items ?? [];

  if (error && !data) return <NoticeBox>{error.message}</NoticeBox>;
  if (isLoading && !data) {
    return (
      <p role="status" className="py-10 text-center text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-5 py-16 text-center">
        <p className="text-card font-semibold text-ink">
          {propertyId || type ? '조건에 맞는 기록이 없습니다' : '아직 관리 로그가 없어요'}
        </p>
        {!propertyId && !type && <Button onClick={() => onNavigate('logRegister')}>기록 추가</Button>}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-section font-semibold text-ink">기록</h2>
        <span className="font-num text-sub tabular-nums text-ink-3">{data.meta.total}건</span>
      </div>
      <table className="w-full text-body">
        <thead>
          <tr className="border-y border-line bg-surface-2 text-left text-chip text-ink-3">
            <th className="px-5 py-2.5 font-medium">날짜</th>
            <th className="px-3 py-2.5 font-medium">호실</th>
            <th className="px-3 py-2.5 font-medium">제목</th>
            <th className="px-3 py-2.5 font-medium">구분</th>
            <th className="px-5 py-2.5 text-right font-medium">비용</th>
          </tr>
        </thead>
        <tbody>
          {items.map((log) => (
            <tr
              key={log.id}
              onClick={() => onNavigate('logDetail', { logId: log.id })}
              className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
            >
              <td className="whitespace-nowrap px-5 py-3.5 font-num tabular-nums text-ink-2">{log.occurredOn}</td>
              <td className="px-3 py-3.5 text-ink-2">{log.property.displayName}</td>
              <td className="px-3 py-3.5 font-semibold text-ink">
                {log.title}
                {formatAttachmentCount(log.attachments) && (
                  <span className="ml-2 font-num text-chip font-normal tabular-nums text-ink-3">{formatAttachmentCount(log.attachments)}</span>
                )}
              </td>
              <td className="px-3 py-3.5">
                <ManagementLogBadges log={log} />
              </td>
              <td className="whitespace-nowrap px-5 py-3.5 text-right font-num tabular-nums text-ink-2">
                {formatWon(log.cost) ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <NoticeBox className="m-5">{error.message}</NoticeBox>}
      {data.meta.hasNext && (
        // 다음 페이지 로드가 실패했으면 page는 이미 N이므로 N+1로 건너뛰지 않고 같은 페이지를 다시 불러온다.
        <div className="border-t border-line p-4 text-center">
          <Button variant="secondary" disabled={isLoading} onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}>
            {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
          </Button>
        </div>
      )}
    </Card>
  );
};

// 관리 로그(하우스 로그) 전체 목록(S-04). 호실 필터는 주소(?propertyId=)에 남겨 호실 상세의 [전체 보기]로 바로 들어온다.
export const ManagementLogListPage = ({ propertyId, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const owned = useGetPropertyList({ relation: 'OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  const formerlyOwned = useGetPropertyList({ relation: 'FORMER_OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  // 팔았다가 다시 소유한 호실이 두 번 나오지 않게 id로 합친다.
  const properties = [
    ...new Map([...(owned.data?.items ?? []), ...(formerlyOwned.data?.items ?? [])].map((item) => [item.id, item])).values(),
  ];
  const [type, setType] = useState(null);

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader
        title="관리 로그 (하우스 로그)"
        description="내 호실의 수리·점검·메모를 날짜 순서로 모아 봐요."
        actions={
          <Button onClick={() => onNavigate('logRegister')}>
            <Plus size={16} className="-ml-0.5 mr-1 inline-block" />
            기록 추가
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="호실"
          value={propertyId ?? ''}
          onChange={(event) => onNavigate('logs', { propertyId: event.target.value || undefined }, { replace: true })}
          className="h-11 max-w-xs rounded-input border border-line bg-surface px-3 text-body text-ink outline-none focus:border-accent"
        >
          <option value="">전체 호실</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.displayName}
            </option>
          ))}
        </select>
        <div role="group" aria-label="유형" className="flex flex-wrap gap-2">
          {TYPE_FILTER_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              selected={option.value === type}
              onClick={() => setType((prev) => (prev === option.value ? null : option.value))}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <ManagementLogListSection
        key={`${propertyId}-${type}`}
        propertyId={propertyId}
        type={type ?? undefined}
        onNavigate={onNavigate}
        onUnauthorized={onUnauthorized}
      />
    </div>
  );
};

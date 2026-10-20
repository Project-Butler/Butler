import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetLandlordBuildingList } from '../hooks/useGetLandlordBuildingList';

const PAGE_SIZE = 20;

// 등록 수 / 정원. 정원이 없으면 등록 수만.
const formatBuildingCount = ({ propertyCount, capacity }) =>
  capacity != null ? `${propertyCount} / ${capacity}` : `${propertyCount}`;

const BuildingCard = ({ building, onClick }) => (
  <button type="button" onClick={onClick} className="block w-full text-left">
    <Card className="p-5 transition-colors hover:bg-surface-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-card font-semibold text-ink">{building.name}</p>
          <p className="mt-0.5 truncate text-sub text-ink-2">{building.complex.roadAddress ?? building.complex.name}</p>
        </div>
        <Badge className="shrink-0">등록중</Badge>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sub">
        <span className="text-ink-2">
          등록 호실 <span className="font-num font-semibold tabular-nums text-ink">{formatBuildingCount(building)}</span>
        </span>
        {building.remainingCount > 0 && (
          <span className="font-medium text-warn-ink">{building.remainingCount}개의 호실이 아직 등록되지 않았어요</span>
        )}
      </div>
    </Card>
  </button>
);

// 내 부동산 = 내 건물 목록(GET /landlord-buildings, 만든 순서). 건물을 누르면 건물 상세(호실 목록).
export const BuildingListPage = ({ onNavigate, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetLandlordBuildingList({ page, size: PAGE_SIZE }, { onUnauthorized });
  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-h1 font-semibold text-ink">내 부동산</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onNavigate('properties', { relation: 'FORMER_OWNER' })}>
            예전 소유 호실
          </Button>
          <Button onClick={() => onNavigate('buildingRegister')}>
            <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
            건물 등록
          </Button>
        </div>
      </div>

      {error && !data && <NoticeBox>{error.message}</NoticeBox>}
      {isLoading && !data && (
        <p role="status" className="py-10 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      )}

      {data && items.length === 0 && (
        <Card className="flex flex-col items-center gap-3 px-5 py-12 text-center">
          <p className="text-card font-semibold text-ink">등록한 건물이 없습니다</p>
          <p className="text-body text-ink-2">도로명주소로 첫 건물을 등록해 보세요.</p>
          <Button onClick={() => onNavigate('buildingRegister')}>
            <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
            건물 등록
          </Button>
        </Card>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          <p className="text-sub text-ink-3">
            건물 <span className="font-num tabular-nums">{data.meta.total}</span>개
          </p>
          {items.map((building) => (
            <BuildingCard
              key={building.id}
              building={building}
              onClick={() => onNavigate('buildingDetail', { landlordBuildingId: building.id })}
            />
          ))}
          {error && <NoticeBox>{error.message}</NoticeBox>}
          {data.meta.hasNext && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={isLoading}
              onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}
            >
              {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

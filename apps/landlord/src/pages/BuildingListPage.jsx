import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetLandlordBuildingList } from '../hooks/useGetLandlordBuildingList';
import { formatDateKST } from '../utils/format';

const PAGE_SIZE = 20;

// 내 부동산 = 내 건물 목록(GET /landlord-buildings, 만든 순서). 행을 누르면 건물 상세(호실 목록).
export const BuildingListPage = ({ onNavigate, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetLandlordBuildingList({ page, size: PAGE_SIZE }, { onUnauthorized });
  const items = data?.items ?? [];

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader
        title="내 부동산"
        description="건물을 등록하고, 건물마다 호실을 추가해 관리해요."
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate('properties', { relation: 'FORMER_OWNER' })}>
              예전 소유 호실
            </Button>
            <Button onClick={() => onNavigate('buildingRegister')}>
              <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
              건물 등록
            </Button>
          </>
        }
      />

      {error && !data && <NoticeBox>{error.message}</NoticeBox>}
      {isLoading && !data && (
        <p role="status" className="py-10 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      )}

      {data && items.length === 0 && (
        <Card className="flex flex-col items-center gap-3 px-5 py-16 text-center">
          <p className="text-card font-semibold text-ink">등록한 건물이 없습니다</p>
          <p className="text-body text-ink-2">도로명주소로 첫 건물을 등록해 보세요.</p>
          <Button onClick={() => onNavigate('buildingRegister')}>
            <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
            건물 등록
          </Button>
        </Card>
      )}

      {items.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-section font-semibold text-ink">건물</h2>
            <span className="font-num text-sub tabular-nums text-ink-3">{data.meta.total}개</span>
          </div>
          <table className="w-full text-body">
            <thead>
              <tr className="border-y border-line bg-surface-2 text-left text-chip text-ink-3">
                <th className="px-5 py-2.5 font-medium">건물명</th>
                <th className="px-3 py-2.5 font-medium">도로명주소</th>
                <th className="px-3 py-2.5 text-right font-medium">등록 호실</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-5 py-2.5 font-medium">등록일</th>
              </tr>
            </thead>
            <tbody>
              {items.map((building) => (
                <tr
                  key={building.id}
                  onClick={() => onNavigate('buildingDetail', { landlordBuildingId: building.id })}
                  className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-5 py-3.5 font-semibold text-ink">{building.name}</td>
                  <td className="max-w-md truncate px-3 py-3.5 text-ink-2">
                    {building.complex.roadAddress ?? building.complex.name}
                  </td>
                  <td className="px-3 py-3.5 text-right font-num tabular-nums text-ink">{building.propertyCount}개</td>
                  <td className="px-3 py-3.5">
                    <Badge>등록중</Badge>
                  </td>
                  <td className="px-5 py-3.5 font-num tabular-nums text-ink-3">{formatDateKST(building.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {error && <NoticeBox className="m-5">{error.message}</NoticeBox>}
          {data.meta.hasNext && (
            <div className="border-t border-line p-4 text-center">
              <Button variant="secondary" disabled={isLoading} onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}>
                {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

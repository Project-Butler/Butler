import { useEffect, useState } from 'react';
import { Archive, Plus } from 'lucide-react';
import { Badge, Button } from '@butler/ui';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { IconTile } from '../components/IconTile/IconTile';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { OwnershipTabs } from '../components/OwnershipTabs/OwnershipTabs';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { formatUnitSpec } from '../utils/format';
import { getUnitTypeLabel } from '../utils/unitListing';

const PAGE_SIZE = 20;

// 예전 소유 호실 표. 소유가 끝난 호실은 계속 쌓일 수 있어 카드 대신 표로 본다. 행을 누르면 그때의 호실 상세(읽기 전용).
const FormerOwnerTable = ({ onNavigate, onUnauthorized, onTotal }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetPropertyList({ relation: 'FORMER_OWNER', page, size: PAGE_SIZE }, { onUnauthorized });
  const items = data?.items ?? [];
  useEffect(() => {
    if (data) onTotal(data.meta.total);
  }, [data, onTotal]);

  if (error && !data) return <NoticeBox>{error.message}</NoticeBox>;
  if (isLoading && !data) {
    return (
      <p role="status" className="py-10 text-center text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }

  return (
    <section className="former-page__table-wrap overflow-hidden rounded-card border border-line bg-surface">
      {items.length === 0 ? (
        <EmptyState icon={Archive} title="예전에 소유했던 부동산이 없습니다" description="소유를 끝낸 호실은 여기에 모여요." />
      ) : (
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-sub font-semibold text-ink-2">
              <th className="w-full px-5 py-3">호실</th>
              <th className="whitespace-nowrap px-5 py-3">방 구성 · 면적 · 층</th>
              <th className="whitespace-nowrap px-5 py-3">상태</th>
            </tr>
          </thead>
          <tbody>
            {items.map((property) => {
              const spec = [getUnitTypeLabel(property.myListing?.unitType), formatUnitSpec(property)].filter(Boolean).join(' · ');
              const open = () => onNavigate('propertyDetail', { propertyId: property.id });
              return (
                <tr
                  key={property.id}
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(event) => event.key === 'Enter' && open()}
                  className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <IconTile icon={Archive} tone="mute" size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{property.displayName}</p>
                        {property.complex.roadAddress && <p className="truncate text-sub text-ink-3">{property.complex.roadAddress}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 font-num tabular-nums text-ink-2">{spec || '—'}</td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <Badge>소유 종료</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {error && <NoticeBox className="m-5">{error.message}</NoticeBox>}
      {data.meta.hasNext && (
        <div className="border-t border-line p-4 text-center">
          <Button variant="secondary" disabled={isLoading} onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}>
            {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
          </Button>
        </div>
      )}
    </section>
  );
};

// 호실 목록(/properties). 현재 소유(OWNER)는 내 부동산 카드 화면으로 보내고, 예전 소유(FORMER_OWNER)는 표로 보여 준다.
// 두 화면 제목은 "내 부동산", 머리 오른쪽에 같은 탭(OwnershipTabs) + [부동산 등록].
export const PropertyListPage = ({ relation, onNavigate, onUnauthorized }) => {
  const currentCount = useGetPropertyList({ relation: 'OWNER', size: 1 }, { onUnauthorized });
  const [formerTotal, setFormerTotal] = useState(null);

  useEffect(() => {
    if (relation !== 'FORMER_OWNER') onNavigate('buildingList', {}, { replace: true });
  }, [relation, onNavigate]);
  if (relation !== 'FORMER_OWNER') return null;

  return (
    <div className="former-page w-full space-y-5 pb-10">
      <PageHeader
        title="내 부동산"
        description="소유가 끝난 호실이에요. 그때 남긴 계약·관리 기록을 볼 수 있어요."
        actions={
          <>
            <OwnershipTabs active="FORMER_OWNER" counts={{ OWNER: currentCount.data?.meta.total, FORMER_OWNER: formerTotal }} onNavigate={onNavigate} />
            <Button size="h44" onClick={() => onNavigate('propertyRegister')}>
              <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
              부동산 등록
            </Button>
          </>
        }
      />
      <FormerOwnerTable onNavigate={onNavigate} onUnauthorized={onUnauthorized} onTotal={setFormerTotal} />
    </div>
  );
};

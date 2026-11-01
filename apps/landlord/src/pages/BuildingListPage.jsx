import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { formatUnitSpec } from '../utils/format';
import { getPropertyStatusBadge, getUnitTypeLabel } from '../utils/unitListing';
import { getVerificationBadge } from '../utils/verificationBadge';

const UNIT_PAGE_SIZE = 20;

// 내 부동산 = 내 호실을 'A단지 101호'처럼 한 줄씩(GET /properties?relation=OWNER, 단지·동·호 순). 행을 누르면 호실 상세.
// params.notice: 등록 직후 안내(이미 등록된 면적·층을 썼을 때 등).
export const BuildingListPage = ({ params, onNavigate, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const units = useGetPropertyList({ relation: 'OWNER', page, size: UNIT_PAGE_SIZE }, { onUnauthorized });

  const unitItems = units.data?.items ?? [];
  const error = units.error;
  const isReady = Boolean(units.data);
  const goRegister = () => onNavigate('propertyRegister');

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader
        title="내 부동산"
        description="단지와 호실을 한눈에 보고 관리해요."
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate('properties', { relation: 'FORMER_OWNER' })}>
              예전 소유 호실
            </Button>
            <Button onClick={goRegister}>
              <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
              부동산 등록
            </Button>
          </>
        }
      />

      {params.notice && <NoticeBox tone="info">{params.notice}</NoticeBox>}
      {error && !isReady && <NoticeBox>{error.message}</NoticeBox>}
      {!error && !isReady && (
        <p role="status" className="py-10 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      )}

      {isReady && unitItems.length === 0 && (
        <Card className="flex flex-col items-center gap-3 px-5 py-16 text-center">
          <p className="text-card font-semibold text-ink">등록한 부동산이 없습니다</p>
          <p className="text-body text-ink-2">주소와 동·호를 입력해 첫 부동산을 등록해 보세요.</p>
          <Button onClick={goRegister}>
            <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
            부동산 등록
          </Button>
        </Card>
      )}

      {isReady && unitItems.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-section font-semibold text-ink">호실</h2>
            <span className="font-num text-sub tabular-nums text-ink-3">{units.data.meta.total}개</span>
          </div>
          <table className="w-full text-body">
            <thead>
              <tr className="border-y border-line bg-surface-2 text-left text-chip text-ink-3">
                <th className="px-5 py-2.5 font-medium">호실</th>
                <th className="px-3 py-2.5 font-medium">도로명주소</th>
                <th className="px-3 py-2.5 font-medium">방 구성 · 면적 · 층</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-5 py-2.5 font-medium">권리자 인증</th>
              </tr>
            </thead>
            <tbody>
              {unitItems.map((property) => {
                const status = getPropertyStatusBadge(property.status);
                const verification = getVerificationBadge(property.myRelation?.verificationStatus);
                const spec = [getUnitTypeLabel(property.myListing?.unitType), formatUnitSpec(property)].filter(Boolean).join(' · ');
                return (
                  <tr
                    key={property.id}
                    onClick={() => onNavigate('propertyDetail', { propertyId: property.id })}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-5 py-3.5 font-semibold text-ink">{property.displayName}</td>
                    <td className="max-w-xs truncate px-3 py-3.5 text-ink-2">{property.complex.roadAddress ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3.5 font-num tabular-nums text-ink-2">{spec || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <Badge tone={verification.tone}>{verification.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {error && <NoticeBox className="m-5">{error.message}</NoticeBox>}
          {units.data.meta.hasNext && (
            // 다음 페이지 로드가 실패했으면 page는 이미 N이므로 N+1로 건너뛰지 않고 같은 페이지를 다시 불러온다.
            <div className="border-t border-line p-4 text-center">
              <Button
                variant="secondary"
                disabled={units.isLoading}
                onClick={() => (units.error ? units.refetch() : setPage((prev) => prev + 1))}
              >
                {units.isLoading ? '불러오는 중' : units.error ? '다시 시도' : '더 보기'}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

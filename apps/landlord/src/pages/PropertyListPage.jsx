import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { formatUnitSpec } from '../utils/format';
import { getVerificationBadge } from '../utils/verificationBadge';

const PAGE_SIZE = 20;

const RELATION_TABS = [
  { relation: 'OWNER', label: '현재 소유' },
  { relation: 'FORMER_OWNER', label: '예전 소유' },
];

const PropertyCard = ({ property, isFormer, onClick }) => {
  const badge = isFormer ? { tone: 'default', label: '소유 종료' } : getVerificationBadge(property.myRelation?.verificationStatus);
  const spec = formatUnitSpec(property);

  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      <Card className="p-5 transition-colors hover:bg-surface-2">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-card font-semibold text-ink">{property.displayName}</p>
          <Badge tone={badge.tone} className="shrink-0">
            {badge.label}
          </Badge>
        </div>
        <p className="mt-1 text-sub text-ink-2">
          아파트{spec && <span className="font-num tabular-nums"> · {spec}</span>}
        </p>
      </Card>
    </button>
  );
};

// 한 탭(관계)의 목록. 탭이 바뀌면 key로 새로 시작해 page가 1로 돌아간다.
const PropertyListSection = ({ relation, onNavigate, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetPropertyList({ relation, page, size: PAGE_SIZE }, { onUnauthorized });
  const isFormer = relation === 'FORMER_OWNER';
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
      <Card className="flex flex-col items-center gap-3 px-5 py-12 text-center">
        <p className="text-card font-semibold text-ink">
          {isFormer ? '예전에 소유했던 부동산이 없습니다' : '등록한 부동산이 없습니다'}
        </p>
        {!isFormer && (
          <>
            <p className="text-body text-ink-2">단지를 검색해 첫 부동산을 등록해 보세요.</p>
            <Button onClick={() => onNavigate('propertyRegister', { step: 1 })}>
              <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
              부동산 등록
            </Button>
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sub text-ink-3">
        전체 <span className="font-num tabular-nums">{data.meta.total}</span>건
      </p>
      {items.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          isFormer={isFormer}
          onClick={() => onNavigate('propertyDetail', { propertyId: property.id })}
        />
      ))}
      {error && <NoticeBox>{error.message}</NoticeBox>}
      {data.meta.hasNext && (
        // 다음 페이지 로드가 실패했으면 page는 이미 N이므로 N+1로 건너뛰지 않고 같은 페이지를 다시 불러온다.
        <Button variant="secondary" className="w-full" disabled={isLoading} onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}>
          {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
        </Button>
      )}
    </div>
  );
};

// 내 부동산 목록: 현재 소유 / 예전 소유. 선택한 탭은 view params(relation)에 두어 뒤로가기로 돌아와도 유지된다.
export const PropertyListPage = ({ relation, onNavigate, onUnauthorized }) => (
  <div className="mx-auto max-w-2xl space-y-5">
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-h1 font-semibold text-ink">내 부동산</h1>
      <Button onClick={() => onNavigate('propertyRegister', { step: 1 })}>
        <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
        부동산 등록
      </Button>
    </div>

    <div role="tablist" aria-label="소유 구분" className="flex gap-1 rounded-btn border border-line bg-surface-2 p-1">
      {RELATION_TABS.map((tab) => {
        const isSelected = tab.relation === relation;
        return (
          <button
            key={tab.relation}
            type="button"
            role="tab"
            id={`property-tab-${tab.relation}`}
            aria-selected={isSelected}
            aria-controls="property-tabpanel"
            onClick={() => !isSelected && onNavigate('properties', { relation: tab.relation }, { replace: true })}
            className={`h-10 flex-1 rounded-input text-body transition-colors ${
              isSelected ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-2 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>

    <div role="tabpanel" id="property-tabpanel" aria-labelledby={`property-tab-${relation}`}>
      <PropertyListSection key={relation} relation={relation} onNavigate={onNavigate} onUnauthorized={onUnauthorized} />
    </div>
  </div>
);

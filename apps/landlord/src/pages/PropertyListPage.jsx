import { useState } from 'react';
import { Badge, Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useBuildingNames } from '../hooks/useBuildingNames';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { formatUnitSpec } from '../utils/format';
import { getUnitTypeLabel } from '../utils/unitListing';
import { getVerificationBadge } from '../utils/verificationBadge';

const PAGE_SIZE = 20;

const RELATION_TABS = [
  { relation: 'OWNER', label: '현재 소유' },
  { relation: 'FORMER_OWNER', label: '예전 소유' },
];

// 한 탭(관계)의 목록. 탭이 바뀌면 key로 새로 시작해 page가 1로 돌아간다.
const PropertyListSection = ({ relation, onNavigate, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetPropertyList({ relation, page, size: PAGE_SIZE }, { onUnauthorized });
  const { getPropertyName } = useBuildingNames({ onUnauthorized });
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
      <Card className="flex flex-col items-center gap-3 px-5 py-16 text-center">
        <p className="text-card font-semibold text-ink">
          {isFormer ? '예전에 소유했던 부동산이 없습니다' : '등록한 부동산이 없습니다'}
        </p>
        {!isFormer && (
          <Button onClick={() => onNavigate('buildingList')}>내 부동산으로</Button>
        )}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-section font-semibold text-ink">{isFormer ? '예전 소유 호실' : '현재 소유 호실'}</h2>
        <span className="font-num text-sub tabular-nums text-ink-3">{data.meta.total}건</span>
      </div>
      <table className="w-full text-body">
        <thead>
          <tr className="border-y border-line bg-surface-2 text-left text-chip text-ink-3">
            <th className="px-5 py-2.5 font-medium">호실</th>
            <th className="px-3 py-2.5 font-medium">방 구성 · 면적 · 층</th>
            <th className="px-5 py-2.5 font-medium">{isFormer ? '상태' : '권리자 인증'}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((property) => {
            const badge = isFormer
              ? { tone: 'default', label: '소유 종료' }
              : getVerificationBadge(property.myRelation?.verificationStatus);
            const spec = [getUnitTypeLabel(property.myListing?.unitType), formatUnitSpec(property)].filter(Boolean).join(' · ');
            return (
              <tr
                key={property.id}
                onClick={() => onNavigate('propertyDetail', { propertyId: property.id })}
                className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-5 py-3.5 font-semibold text-ink">{getPropertyName(property)}</td>
                <td className="px-3 py-3.5 font-num tabular-nums text-ink-2">{spec || '—'}</td>
                <td className="px-5 py-3.5">
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </td>
              </tr>
            );
          })}
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

// 호실 목록: 현재 소유 / 예전 소유. 선택한 탭은 view params(relation)에 두어 뒤로가기로 돌아와도 유지된다.
export const PropertyListPage = ({ relation, onNavigate, onUnauthorized }) => (
  <div className="w-full max-w-6xl space-y-6 pb-10">
    <PageHeader title="호실 목록" onBack={() => window.history.back()} />

    <div role="tablist" aria-label="소유 구분" className="flex w-80 gap-1 rounded-btn border border-line bg-surface-2 p-1">
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

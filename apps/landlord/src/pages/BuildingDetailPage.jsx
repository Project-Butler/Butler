import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetComplex } from '../hooks/useGetComplex';
import { useGetLandlordBuilding } from '../hooks/useGetLandlordBuilding';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { formatDetailBuildingRange } from '../utils/detailBuildingNames';
import { formatFloor } from '../utils/floor';
import { compareUnits, formatUnitLabel } from '../utils/unitAddress';
import { getPropertyStatusBadge, getUnitTypeLabel } from '../utils/unitListing';
import { getVerificationBadge } from '../utils/verificationBadge';

const UNIT_PAGE_SIZE = 50;

const InfoRow = ({ label, value, numeric = false }) => (
  <div className="flex gap-4 py-2.5">
    <dt className="w-28 shrink-0 text-body text-ink-3">{label}</dt>
    <dd className={`min-w-0 flex-1 whitespace-pre-line text-body text-ink ${numeric ? 'font-num tabular-nums' : ''}`}>
      {value ?? '—'}
    </dd>
  </div>
);

// 이 건물(단지)의 내 호실 목록(GET /properties?relation=OWNER&complexId=). 표시는 (동, 호) 자연 정렬.
const UnitTable = ({ complexId, onNavigate, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetPropertyList(
    { relation: 'OWNER', complexId, page, size: UNIT_PAGE_SIZE },
    { onUnauthorized },
  );
  const items = [...(data?.items ?? [])].sort(compareUnits);

  if (error && !data) return <NoticeBox>{error.message}</NoticeBox>;
  if (isLoading && !data) {
    return (
      <p role="status" className="py-6 text-center text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }
  if (items.length === 0) return <p className="px-5 pb-5 text-body text-ink-3">아직 등록한 호실이 없습니다</p>;

  return (
    <>
      <table className="w-full text-body">
        <thead>
          <tr className="border-y border-line text-left text-chip text-ink-3">
            <th className="px-5 py-2 font-medium">동·호</th>
            <th className="px-3 py-2 font-medium">층</th>
            <th className="px-3 py-2 font-medium">방 구성</th>
            <th className="px-3 py-2 font-medium">면적</th>
            <th className="px-3 py-2 font-medium">상태</th>
            <th className="px-5 py-2 font-medium">인증</th>
          </tr>
        </thead>
        <tbody>
          {items.map((property) => {
            const status = getPropertyStatusBadge(property.status);
            const verification = getVerificationBadge(property.myRelation?.verificationStatus);
            return (
              <tr
                key={property.id}
                onClick={() => onNavigate('propertyDetail', { propertyId: property.id })}
                className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-5 py-3 font-medium text-ink">{formatUnitLabel(property.buildingNo, property.unitNo)}</td>
                <td className="px-3 py-3 font-num tabular-nums text-ink-2">{formatFloor(property.floor) ?? '—'}</td>
                <td className="px-3 py-3 text-ink-2">{getUnitTypeLabel(property.myListing?.unitType) ?? '—'}</td>
                <td className="px-3 py-3 font-num tabular-nums text-ink-2">
                  {property.exclusiveArea != null ? `${property.exclusiveArea}㎡` : '—'}
                </td>
                <td className="px-3 py-3">
                  <Badge tone={status.tone}>{status.label}</Badge>
                </td>
                <td className="px-5 py-3">
                  <Badge tone={verification.tone}>{verification.label}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <NoticeBox className="m-5">{error.message}</NoticeBox>}
      {data.meta.hasNext && (
        <div className="p-5">
          <Button
            variant="secondary"
            className="w-full"
            disabled={isLoading}
            onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}
          >
            {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
          </Button>
        </div>
      )}
    </>
  );
};

// 건물 상세: 건물 설정 + 주소 + 내 호실 목록 + 호실 추가
export const BuildingDetailPage = ({ landlordBuildingId, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const buildingQuery = useGetLandlordBuilding(landlordBuildingId, hookOptions);
  const building = buildingQuery.data;
  const complexQuery = useGetComplex(building?.complex.id, hookOptions);
  const complex = complexQuery.data;

  const goBack = () => window.history.back();

  if (!building) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="건물 상세" onBack={goBack} />
        {buildingQuery.error ? (
          <NoticeBox>{buildingQuery.error.message}</NoticeBox>
        ) : (
          <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>
        )}
      </div>
    );
  }

  const complexId = building.complex.id;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <PageHeader title={building.name} onBack={goBack} />
      {complexQuery.error && <NoticeBox>{complexQuery.error.message}</NoticeBox>}

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-section font-semibold text-ink">건물 정보</h2>
            <Badge>등록중</Badge>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('buildingEdit', { landlordBuildingId })}>
            수정
          </Button>
        </div>
        <dl className="divide-y divide-line">
          <InfoRow label="도로명" value={building.complex.roadAddress} />
          <InfoRow label="지번" value={complex?.jibunAddress} />
          <InfoRow label="우편번호" value={complex?.zipCode} numeric />
          <InfoRow label="동 목록" value={formatDetailBuildingRange(complex?.detailBuildingNames)} />
          <InfoRow
            label="등록 호실"
            value={building.capacity != null ? `${building.propertyCount} / ${building.capacity}개` : `${building.propertyCount}개`}
            numeric
          />
          <InfoRow label="설명" value={building.memo} />
        </dl>
        {building.remainingCount > 0 && (
          <p className="text-sub font-medium text-warn-ink">{building.remainingCount}개의 호실이 아직 등록되지 않았어요</p>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between p-5">
          <h2 className="text-section font-semibold text-ink">호실</h2>
          <Button size="sm" onClick={() => onNavigate('propertyRegister', { complexId })}>
            <Plus size={14} className="-ml-0.5 mr-1 inline-block" />
            호실 추가
          </Button>
        </div>
        <UnitTable complexId={complexId} onNavigate={onNavigate} onUnauthorized={onUnauthorized} />
      </Card>
    </div>
  );
};

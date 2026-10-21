import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Badge, Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetComplex } from '../hooks/useGetComplex';
import { useGetLandlordBuilding } from '../hooks/useGetLandlordBuilding';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { formatDetailBuildingRange } from '../utils/detailBuildingNames';
import { formatFloor } from '../utils/floor';
import { compareUnits, formatUnitLabel } from '../utils/unitAddress';
import { formatEquipment, getPropertyStatusBadge, getUnitTypeLabel } from '../utils/unitListing';
import { getVerificationBadge } from '../utils/verificationBadge';

const UNIT_PAGE_SIZE = 50;

const InfoItem = ({ label, value, numeric = false }) => (
  <div className="min-w-0">
    <dt className="text-sub text-ink-3">{label}</dt>
    <dd className={`mt-0.5 whitespace-pre-line text-body text-ink ${numeric ? 'font-num tabular-nums' : ''}`}>{value ?? '—'}</dd>
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

  if (error && !data) return <NoticeBox className="mx-5 mb-5">{error.message}</NoticeBox>;
  if (isLoading && !data) {
    return (
      <p role="status" className="py-8 text-center text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="border-t border-line px-5 py-12 text-center">
        <p className="text-body font-semibold text-ink">아직 등록한 호실이 없습니다</p>
        <p className="mt-1 text-sub text-ink-2">오른쪽 위 [호실 추가]로 첫 호실을 등록해 보세요.</p>
      </div>
    );
  }

  return (
    <>
      <table className="w-full text-body">
        <thead>
          <tr className="border-y border-line bg-surface-2 text-left text-chip text-ink-3">
            <th className="px-5 py-2.5 font-medium">동·호</th>
            <th className="px-3 py-2.5 font-medium">층</th>
            <th className="px-3 py-2.5 text-right font-medium">전용면적</th>
            <th className="px-3 py-2.5 font-medium">방 구성</th>
            <th className="px-3 py-2.5 font-medium">설비</th>
            <th className="px-3 py-2.5 font-medium">상태</th>
            <th className="px-5 py-2.5 font-medium">권리자 인증</th>
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
                <td className="px-5 py-3.5 font-semibold text-ink">{formatUnitLabel(property.buildingNo, property.unitNo)}</td>
                <td className="px-3 py-3.5 font-num tabular-nums text-ink-2">{formatFloor(property.floor) ?? '—'}</td>
                <td className="px-3 py-3.5 text-right font-num tabular-nums text-ink-2">
                  {property.exclusiveArea != null ? `${property.exclusiveArea}㎡` : '—'}
                </td>
                <td className="px-3 py-3.5 text-ink-2">{getUnitTypeLabel(property.myListing?.unitType) ?? '—'}</td>
                <td className="max-w-[16rem] truncate px-3 py-3.5 text-ink-2">
                  {formatEquipment(property.myListing?.equipment, property.myListing?.equipmentEtc) ?? '—'}
                </td>
                <td className="px-3 py-3.5">
                  <Badge tone={status.tone}>{status.label}</Badge>
                </td>
                <td className="px-5 py-3.5">
                  <Badge tone={verification.tone}>{verification.label}</Badge>
                </td>
              </tr>
            );
          })}
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
    </>
  );
};

// 건물 상세: 건물 정보(주소·우편번호·동 목록·설명) + 내 호실 표 + [수정]·[호실 추가]
export const BuildingDetailPage = ({ landlordBuildingId, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const buildingQuery = useGetLandlordBuilding(landlordBuildingId, hookOptions);
  const building = buildingQuery.data;
  const complexQuery = useGetComplex(building?.complex.id, hookOptions);
  const complex = complexQuery.data;

  const goBack = () => window.history.back();

  if (!building) {
    return (
      <div className="w-full max-w-6xl space-y-6">
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
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader
        title={building.name}
        description={building.complex.roadAddress ?? building.complex.name}
        onBack={goBack}
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate('buildingEdit', { landlordBuildingId })}>
              <Pencil size={14} className="-ml-0.5 mr-1.5 inline-block" />
              수정
            </Button>
            <Button onClick={() => onNavigate('propertyRegister', { complexId })}>
              <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
              호실 추가
            </Button>
          </>
        }
      />
      {complexQuery.error && <NoticeBox>{complexQuery.error.message}</NoticeBox>}

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-section font-semibold text-ink">건물 정보</h2>
          <Badge>등록중</Badge>
        </div>
        <dl className="grid grid-cols-4 gap-x-6 gap-y-4">
          <div className="col-span-2">
            <InfoItem label="도로명주소" value={building.complex.roadAddress} />
          </div>
          <div className="col-span-2">
            <InfoItem label="지번" value={complex?.jibunAddress} />
          </div>
          <InfoItem label="우편번호" value={complex?.zipCode} numeric />
          <InfoItem label="동 목록" value={formatDetailBuildingRange(complex?.detailBuildingNames)} />
          <InfoItem label="등록 호실" value={`${building.propertyCount}개`} numeric />
          <InfoItem label="설명" value={building.memo} />
        </dl>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-section font-semibold text-ink">호실</h2>
          <span className="font-num text-sub tabular-nums text-ink-3">{building.propertyCount}개</span>
        </div>
        <UnitTable complexId={complexId} onNavigate={onNavigate} onUnauthorized={onUnauthorized} />
      </Card>
    </div>
  );
};

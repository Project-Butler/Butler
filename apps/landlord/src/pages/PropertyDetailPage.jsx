import { useState } from 'react';
import { Badge, Button, Card, TextField } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useBuildingNames } from '../hooks/useBuildingNames';
import { useGetComplex } from '../hooks/useGetComplex';
import { useGetProperty } from '../hooks/useGetProperty';
import { useGetPropertyOwnership } from '../hooks/useGetPropertyOwnership';
import { usePatchProperty } from '../hooks/usePatchProperty';
import { usePatchPropertyOwnership } from '../hooks/usePatchPropertyOwnership';
import { usePostPropertyOwnershipEnd } from '../hooks/usePostPropertyOwnershipEnd';
import { toFieldErrors } from '../utils/apiError';
import { formatFloor, parseFloorInput, toFloorText, validateFloorInput } from '../utils/floor';
import { formatDateKST, formatNumber } from '../utils/format';
import {
  toAreaInput,
  toPriceDigits,
  toYearMonthInput,
  validateAcquiredYearMonth,
  validateExclusiveArea,
  validatePurchasePrice,
} from '../utils/formValidation';
import { formatUnitLabel } from '../utils/unitAddress';
import {
  EQUIPMENT_OPTIONS,
  formatEquipment,
  getPropertyStatusBadge,
  getUnitTypeLabel,
  MAX_EQUIPMENT_ETC_LENGTH,
  UNIT_TYPE_OPTIONS,
} from '../utils/unitListing';
import { getVerificationBadge } from '../utils/verificationBadge';

const END_REASONS = ['매도', '증여', '기타'];

// 값이 없으면 '—'. numeric이면 숫자 글꼴.
const InfoRow = ({ label, value, numeric = false }) => (
  <div className="flex gap-4 py-2.5">
    <dt className="w-24 shrink-0 text-body text-ink-3">{label}</dt>
    <dd className={`min-w-0 flex-1 text-body text-ink ${numeric ? 'font-num tabular-nums' : ''}`}>{value ?? '—'}</dd>
  </div>
);

const SectionTitle = ({ children, action }) => (
  <div className="flex items-center justify-between gap-3">
    <h2 className="text-section font-semibold text-ink">{children}</h2>
    {action}
  </div>
);

// 호실 정보: 주소·법정동·건물 정보 + 동·호 + 면적·층(인증된 소유자만 수정, 아니면 잠금 + 안내)
const BasicInfoSection = ({ property, complex, onSaved, onUnauthorized }) => {
  const patch = usePatchProperty({ onUnauthorized });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({ exclusiveArea: '', floor: '' });
  const [fieldErrors, setFieldErrors] = useState({});

  const { myRelation } = property;
  const canEdit = myRelation?.type === 'OWNER' && myRelation.verificationStatus === 'VERIFIED';
  const buildingInfo = complex?.buildingInfo;

  const startEdit = () => {
    setDraft({
      exclusiveArea: property.exclusiveArea != null ? String(property.exclusiveArea) : '',
      floor: toFloorText(property.floor),
    });
    setFieldErrors({});
    patch.reset();
    setIsEditing(true);
  };

  const clientErrors = { exclusiveArea: validateExclusiveArea(draft.exclusiveArea), floor: validateFloorInput(draft.floor) };
  const hasClientError = Boolean(clientErrors.exclusiveArea || clientErrors.floor);

  // 미인증이면 저장 버튼이 비활성이라 여기까지 오지 않는다. 403 박스는 서버만 거절하는 경우
  // (불러온 뒤 저장 전에 인증이 만료됨 등)를 위한 것이다.
  const handleSave = async () => {
    if (hasClientError) return;
    const { data, error } = await patch.updateProperty(property.id, {
      exclusiveArea: draft.exclusiveArea ? Number(draft.exclusiveArea) : null,
      floor: parseFloorInput(draft.floor),
    });
    if (data) {
      setIsEditing(false);
      onSaved();
      return;
    }
    if (error?.status === 400) setFieldErrors(toFieldErrors(error));
  };

  const showErrorBox = patch.error && !(patch.error.status === 400 && (fieldErrors.exclusiveArea || fieldErrors.floor));

  return (
    <Card className="space-y-4 p-6">
      <SectionTitle
        action={
          !isEditing && (
            <Button variant="secondary" size="sm" onClick={startEdit} disabled={!canEdit}>
              수정
            </Button>
          )
        }
      >
        호실 정보
      </SectionTitle>
      {!canEdit && !isEditing && <p className="text-sub text-ink-3">면적·층은 권리자 인증 후 수정할 수 있습니다</p>}

      <dl className="divide-y divide-line">
        <InfoRow label="도로명" value={complex?.roadAddress} />
        <InfoRow label="지번" value={complex?.jibunAddress} />
        <InfoRow label="법정동" value={complex?.region.fullName} />
        <InfoRow label="동·호" value={formatUnitLabel(property.buildingNo, property.unitNo)} />
        <InfoRow label="준공일" value={buildingInfo?.approvalDate} numeric />
        <InfoRow
          label="세대수"
          value={buildingInfo?.householdCount != null ? `${formatNumber(buildingInfo.householdCount)}세대` : null}
          numeric
        />
        {!isEditing && (
          <>
            <InfoRow label="전용면적" value={property.exclusiveArea != null ? `${property.exclusiveArea}㎡` : null} numeric />
            <InfoRow label="층" value={formatFloor(property.floor)} numeric />
          </>
        )}
      </dl>

      {isEditing && (
        <div className="space-y-4 border-t border-line pt-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="전용면적"
              suffix="㎡"
              numeric
              value={draft.exclusiveArea}
              onChange={(event) => setDraft((prev) => ({ ...prev, exclusiveArea: toAreaInput(event.target.value) }))}
              error={clientErrors.exclusiveArea ?? fieldErrors.exclusiveArea}
            />
            <TextField
              label="층"
              placeholder="12 또는 B1"
              hint="지하는 B1처럼 적어요"
              value={draft.floor}
              onChange={(event) => setDraft((prev) => ({ ...prev, floor: event.target.value }))}
              error={clientErrors.floor ?? fieldErrors.floor}
            />
          </div>
          {showErrorBox && <NoticeBox>{patch.error.message}</NoticeBox>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsEditing(false)} disabled={patch.isLoading}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={hasClientError || patch.isLoading}>
              {patch.isLoading ? '저장 중' : '저장'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

// 내 소유 정보: 취득 연월·매입가 수정, 호실 삭제(= 소유 관계 종료, 확인 패널). 종료된 소유 관계는 조회만.
const OwnershipSection = ({ ownership, onSaved, onEnded, onUnauthorized }) => {
  const patch = usePatchPropertyOwnership({ onUnauthorized });
  const end = usePostPropertyOwnershipEnd({ onUnauthorized });
  const [mode, setMode] = useState('view'); // view | edit | end
  const [draft, setDraft] = useState({ acquiredYearMonth: '', purchasePrice: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [endReason, setEndReason] = useState(null);

  const badge = getVerificationBadge(ownership.verificationStatus);
  const isVerified = ownership.verificationStatus === 'VERIFIED';

  const startEdit = () => {
    setDraft({
      acquiredYearMonth: ownership.acquiredYearMonth ?? '',
      purchasePrice: ownership.purchasePrice != null ? String(ownership.purchasePrice) : '',
    });
    setFieldErrors({});
    patch.reset();
    setMode('edit');
  };

  const startEnd = () => {
    setEndReason(null);
    end.reset();
    setMode('end');
  };

  const clientErrors = {
    acquiredYearMonth: validateAcquiredYearMonth(draft.acquiredYearMonth),
    purchasePrice: validatePurchasePrice(draft.purchasePrice),
  };
  const hasClientError = Boolean(clientErrors.acquiredYearMonth || clientErrors.purchasePrice);

  const handleSave = async () => {
    if (hasClientError) return;
    const { data, error } = await patch.updateOwnership(ownership.id, {
      acquiredYearMonth: draft.acquiredYearMonth || null,
      purchasePrice: draft.purchasePrice ? Number(draft.purchasePrice) : null,
    });
    if (data) {
      setMode('view');
      onSaved();
      return;
    }
    if (error?.status === 400) setFieldErrors(toFieldErrors(error));
  };

  const handleEnd = async () => {
    const { data } = await end.endOwnership(ownership.id, endReason ? { reason: endReason } : {});
    if (data) onEnded();
  };

  const showPatchErrorBox =
    patch.error && !(patch.error.status === 400 && (fieldErrors.acquiredYearMonth || fieldErrors.purchasePrice));

  return (
    <Card className="space-y-4 p-6">
      <SectionTitle action={<Badge tone={badge.tone}>{badge.label}</Badge>}>내 소유 정보</SectionTitle>

      {mode !== 'edit' && (
        <dl className="divide-y divide-line">
          <InfoRow label="취득 연월" value={ownership.acquiredYearMonth} numeric />
          <InfoRow
            label="매입가"
            value={ownership.purchasePrice != null ? `${formatNumber(ownership.purchasePrice)}원` : null}
            numeric
          />
          <InfoRow label="인증일" value={formatDateKST(ownership.verifiedAt)} numeric />
          <InfoRow label="인증 만료일" value={formatDateKST(ownership.verificationExpiresAt)} numeric />
          <InfoRow label="소유 시작" value={formatDateKST(ownership.startedAt)} numeric />
          {!ownership.isActive && <InfoRow label="소유 종료" value={formatDateKST(ownership.endedAt)} numeric />}
        </dl>
      )}

      {ownership.isActive && mode === 'view' && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          {!isVerified && (
            // 권리자 인증 절차는 피처 팀 작업 — 지금은 자리만 둔다.
            <Button variant="verifyOutline" size="sm" disabled title="권리자 인증은 준비 중입니다">
              인증하기
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={startEdit}>
            수정
          </Button>
          <Button variant="secondary" size="sm" onClick={startEnd}>
            호실 삭제
          </Button>
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="취득 연월"
              numeric
              inputMode="numeric"
              placeholder="2019-03"
              maxLength={7}
              value={draft.acquiredYearMonth}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, acquiredYearMonth: toYearMonthInput(event.target.value) }))
              }
              error={clientErrors.acquiredYearMonth ?? fieldErrors.acquiredYearMonth}
            />
            <TextField
              label="매입가"
              suffix="원"
              numeric
              inputMode="numeric"
              maxLength={22}
              value={draft.purchasePrice ? formatNumber(draft.purchasePrice) : ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, purchasePrice: toPriceDigits(event.target.value) }))}
              error={clientErrors.purchasePrice ?? fieldErrors.purchasePrice}
            />
          </div>
          {showPatchErrorBox && <NoticeBox>{patch.error.message}</NoticeBox>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode('view')} disabled={patch.isLoading}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={hasClientError || patch.isLoading}>
              {patch.isLoading ? '저장 중' : '저장'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'end' && (
        <div className="space-y-4 border-t border-line pt-4">
          <div>
            <p className="text-body font-semibold text-ink">이 호실을 삭제할까요?</p>
            <p className="mt-0.5 text-sub text-ink-2">
              내 소유 관계를 종료합니다. 되돌릴 수 없고 &apos;예전 소유 호실&apos;로 옮겨지며, 건물의 등록 호실 수에서 빠집니다.
              진행 중인 계약이 있으면 삭제할 수 없어요.
            </p>
          </div>
          <div>
            <p className="text-label font-semibold text-ink">종료 사유 (선택)</p>
            <div role="radiogroup" aria-label="종료 사유" className="mt-1.5 flex gap-1 rounded-btn border border-line bg-surface-2 p-1">
              {END_REASONS.map((reason) => {
                const isSelected = endReason === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setEndReason(isSelected ? null : reason)}
                    className={`h-10 flex-1 rounded-input text-body transition-colors ${
                      isSelected ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-2 hover:text-ink'
                    }`}
                  >
                    {reason}
                  </button>
                );
              })}
            </div>
          </div>
          {end.error && <NoticeBox>{end.error.message}</NoticeBox>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode('view')} disabled={end.isLoading}>
              취소
            </Button>
            <Button onClick={handleEnd} disabled={end.isLoading}>
              {end.isLoading ? '삭제 중' : '호실 삭제'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

// 내 임대 조건: 방 구성·설비(내 활성 소유 관계에 저장, PATCH /property-ownerships/:id). 종료된 소유 관계는 조회만.
const ListingSection = ({ ownership, onSaved, onUnauthorized }) => {
  const patch = usePatchPropertyOwnership({ onUnauthorized });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({ unitType: '', equipment: [], equipmentEtc: '' });

  const startEdit = () => {
    setDraft({
      unitType: ownership.unitType ?? '',
      equipment: ownership.equipment ?? [],
      equipmentEtc: ownership.equipmentEtc ?? '',
    });
    patch.reset();
    setIsEditing(true);
  };

  const toggleEquipment = (code) =>
    setDraft((prev) => ({
      ...prev,
      equipment: prev.equipment.includes(code) ? prev.equipment.filter((value) => value !== code) : [...prev.equipment, code],
    }));

  const etcError =
    draft.equipmentEtc.trim().length > MAX_EQUIPMENT_ETC_LENGTH ? `${MAX_EQUIPMENT_ETC_LENGTH}자 이하로 입력해 주세요.` : undefined;

  const handleSave = async () => {
    if (etcError) return;
    const { data } = await patch.updateOwnership(ownership.id, {
      unitType: draft.unitType || null,
      equipment: draft.equipment,
      equipmentEtc: draft.equipmentEtc.trim() || null,
    });
    if (data) {
      setIsEditing(false);
      onSaved();
    }
  };

  return (
    <Card className="space-y-4 p-6">
      <SectionTitle
        action={
          ownership.isActive &&
          !isEditing && (
            <Button variant="secondary" size="sm" onClick={startEdit}>
              수정
            </Button>
          )
        }
      >
        임대 조건
      </SectionTitle>

      {!isEditing && (
        <dl className="divide-y divide-line">
          <InfoRow label="방 구성" value={getUnitTypeLabel(ownership.unitType)} />
          <InfoRow label="설비" value={formatEquipment(ownership.equipment, ownership.equipmentEtc)} />
        </dl>
      )}

      {isEditing && (
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="listing-unit-type" className="text-label font-semibold text-ink">
              방 구성
            </label>
            <select
              id="listing-unit-type"
              value={draft.unitType}
              onChange={(event) => setDraft((prev) => ({ ...prev, unitType: event.target.value }))}
              className="h-12 rounded-input border border-line bg-surface px-3 text-card text-ink outline-none focus:border-accent"
            >
              <option value="">선택 안 함</option>
              {UNIT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-label font-semibold text-ink">설비</p>
            <div className="grid grid-cols-3 gap-2">
              {EQUIPMENT_OPTIONS.map((option) => (
                <label key={option.value} className="flex h-10 cursor-pointer items-center gap-2 rounded-input border border-line px-3 text-body text-ink-2 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={draft.equipment.includes(option.value)}
                    onChange={() => toggleEquipment(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          <TextField
            label="기타 설비"
            maxLength={MAX_EQUIPMENT_ETC_LENGTH}
            value={draft.equipmentEtc}
            onChange={(event) => setDraft((prev) => ({ ...prev, equipmentEtc: event.target.value }))}
            error={etcError}
          />
          {patch.error && <NoticeBox>{patch.error.message}</NoticeBox>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsEditing(false)} disabled={patch.isLoading}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={Boolean(etcError) || patch.isLoading}>
              {patch.isLoading ? '저장 중' : '저장'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

// 임대 정보·임차인·계약 자리. TODO(#4 계약 관리): 계약 데이터가 생기면 채운다.
const LeaseSection = () => (
  <Card className="space-y-4 p-6">
    <SectionTitle>임대 정보</SectionTitle>
    <dl className="divide-y divide-line">
      <InfoRow label="계약 상태" value="계약 등록 전" />
      <InfoRow label="임차인" value={null} />
      <InfoRow label="계약" value={null} />
    </dl>
  </Card>
);

// 호실 상세. 소유 정보·임대 조건은 내 소유 관계(myRelation.ownershipId)가 있을 때만 불러온다.
export const PropertyDetailPage = ({ propertyId, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const propertyQuery = useGetProperty(propertyId, hookOptions);
  const property = propertyQuery.data;
  const complexQuery = useGetComplex(property?.complex.id, hookOptions);
  const ownershipQuery = useGetPropertyOwnership(property?.myRelation?.ownershipId, hookOptions);
  const { getPropertyName } = useBuildingNames(hookOptions);

  const goBack = () => window.history.back();

  if (!property) {
    return (
      <div className="w-full max-w-6xl space-y-6">
        <PageHeader title="호실 상세" onBack={goBack} />
        {propertyQuery.error ? (
          <NoticeBox>{propertyQuery.error.message}</NoticeBox>
        ) : (
          <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>
        )}
      </div>
    );
  }

  const status = getPropertyStatusBadge(property.status);
  const verification = getVerificationBadge(property.myRelation?.verificationStatus);

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader
        title={getPropertyName(property)}
        description={complexQuery.data?.roadAddress ?? complexQuery.data?.jibunAddress}
        onBack={goBack}
        actions={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            {property.myRelation?.type === 'OWNER' && <Badge tone={verification.tone}>{verification.label}</Badge>}
          </>
        }
      />
      {propertyQuery.error && <NoticeBox>{propertyQuery.error.message}</NoticeBox>}
      {complexQuery.error && <NoticeBox>{complexQuery.error.message}</NoticeBox>}
      {ownershipQuery.error && <NoticeBox>{ownershipQuery.error.message}</NoticeBox>}

      <div className="grid grid-cols-2 items-start gap-6">
        <div className="space-y-6">
          <BasicInfoSection
            property={property}
            complex={complexQuery.data}
            onSaved={propertyQuery.refetch}
            onUnauthorized={onUnauthorized}
          />
          {ownershipQuery.data && (
            <ListingSection
              key={`listing-${ownershipQuery.data.id}`}
              ownership={ownershipQuery.data}
              onSaved={ownershipQuery.refetch}
              onUnauthorized={onUnauthorized}
            />
          )}
        </div>

        <div className="space-y-6">
          <LeaseSection />
          {ownershipQuery.data && (
            <OwnershipSection
              key={ownershipQuery.data.id}
              ownership={ownershipQuery.data}
              onSaved={ownershipQuery.refetch}
              // 들어온 화면(건물 상세·홈 등)으로 돌아간다. 그 화면은 다시 열리면서 새 목록을 불러온다.
              onEnded={goBack}
              onUnauthorized={onUnauthorized}
            />
          )}
        </div>
      </div>
    </div>
  );
};

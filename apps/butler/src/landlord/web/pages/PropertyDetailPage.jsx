import { useCallback, useState } from 'react';
import { Badge, Button, Card, TextField } from '@butler/ui';
import { Archive, Building2, History, MapPin, Pencil, Plus } from 'lucide-react';
import { DateTile } from '../components/DateTile/DateTile';
import { IconTile } from '../components/IconTile/IconTile';
import { ManagementLogBadges } from '../components/ManagementLogBadges/ManagementLogBadges';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { PropertyContractArea } from '../components/PropertyContractArea/PropertyContractArea';
import { LogFormModal } from '../components/LogFormModal/LogFormModal';
import { VerifyModal } from '../components/VerifyModal/VerifyModal';
import { VerificationPanel } from '../components/VerificationPanel/VerificationPanel';
import { useGetComplex } from '../hooks/useGetComplex';
import { useGetLatestOwnershipVerification } from '../hooks/useGetLatestOwnershipVerification';
import { useGetManagementLogList } from '../hooks/useGetManagementLogList';
import { useGetOwnershipRenewalNoticeList } from '../hooks/useGetOwnershipRenewalNoticeList';
import { useGetProperty } from '../hooks/useGetProperty';
import { useGetPropertyOwnership } from '../hooks/useGetPropertyOwnership';
import { usePatchProperty } from '../hooks/usePatchProperty';
import { usePatchPropertyOwnership } from '../hooks/usePatchPropertyOwnership';
import { usePostPropertyOwnershipEnd } from '../hooks/usePostPropertyOwnershipEnd';
import { toFieldErrors } from '../../../shared/apiError';
import { formatWon } from '../utils/contract';
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
import { END_REASONS, isSoldReason, toOwnershipEndBody } from '../utils/ownershipVerification';
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

// 값이 없으면 '—'(optional이면 줄을 숨김). numeric이면 숫자 글꼴, seal이면 검증된 값을 뜻하는 남색 글자.
const InfoRow = ({ label, value, numeric = false, seal = false, optional = false }) =>
  optional && (value == null || value === '') ? null : (
  <div className="flex gap-4 py-2.5">
    <dt className="w-24 shrink-0 text-body text-ink-3">{label}</dt>
    <dd className={`min-w-0 flex-1 text-body ${seal ? 'text-seal-ink' : 'text-ink'} ${numeric ? 'font-num tabular-nums' : ''}`}>
      {value ?? '—'}
    </dd>
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
    <Card className="space-y-4 p-5">
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
        <InfoRow label="준공일" value={buildingInfo?.approvalDate} numeric optional />
        <InfoRow
          label="세대수"
          value={buildingInfo?.householdCount != null ? `${formatNumber(buildingInfo.householdCount)}세대` : null}
          numeric
          optional
        />
        {!isEditing && (
          <>
            <InfoRow label="전용면적" value={property.exclusiveArea != null ? `${property.exclusiveArea}㎡` : null} numeric optional />
            <InfoRow label="층" value={formatFloor(property.floor)} numeric optional />
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
// 권리자 인증 상태·버튼은 오른쪽 위 VerificationPanel이 맡는다.
const OwnershipSection = ({ ownership, onSaved, onEnded, onUnauthorized }) => {
  const patch = usePatchPropertyOwnership({ onUnauthorized });
  const end = usePostPropertyOwnershipEnd({ onUnauthorized });
  const [mode, setMode] = useState('view'); // view | edit | end
  const [draft, setDraft] = useState({ acquiredYearMonth: '', purchasePrice: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [endReason, setEndReason] = useState(null);

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
    const { data } = await end.endOwnership(ownership.id, toOwnershipEndBody(endReason));
    if (data) onEnded();
  };

  const showPatchErrorBox =
    patch.error && !(patch.error.status === 400 && (fieldErrors.acquiredYearMonth || fieldErrors.purchasePrice));

  return (
    <Card className="space-y-4 p-5">
      <SectionTitle
        action={
          ownership.isActive &&
          mode === 'view' && (
            <Button variant="secondary" size="sm" onClick={startEdit}>
              <Pencil size={14} className="-ml-0.5 mr-1 inline-block" />
              수정
            </Button>
          )
        }
      >
        내 소유 정보
      </SectionTitle>

      {mode !== 'edit' && (
        <dl className="divide-y divide-line">
          <InfoRow label="취득 연월" value={ownership.acquiredYearMonth} numeric />
          <InfoRow
            label="매입가"
            value={ownership.purchasePrice != null ? `${formatNumber(ownership.purchasePrice)}원` : null}
            numeric
          />
          <InfoRow label="인증일" value={formatDateKST(ownership.verifiedAt)} numeric seal={isVerified} />
          <InfoRow label="인증 만료일" value={formatDateKST(ownership.verificationExpiresAt)} numeric seal={isVerified} />
          <InfoRow label="소유 시작" value={formatDateKST(ownership.startedAt)} numeric />
          {!ownership.isActive && <InfoRow label="소유 종료" value={formatDateKST(ownership.endedAt)} numeric />}
        </dl>
      )}

      {ownership.isActive && mode === 'view' && (
        <div className="border-t border-line pt-3">
          <button type="button" onClick={startEnd} className="inline-flex items-center gap-1.5 text-sub font-medium text-crit-ink hover:underline">
            <Archive size={14} aria-hidden="true" />
            호실 삭제(소유 종료)
          </button>
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
              내 소유 관계를 종료합니다. 되돌릴 수 없고 &apos;예전 소유 호실&apos;로 옮겨지며, 건물의 등록 호실 수에서 빠집니다.{' '}
              {isSoldReason(endReason)
                ? '매도는 진행 중인 계약이 있어도 종료돼요. 계약은 수정·해지할 수 없고 보기만 할 수 있어요.'
                : "진행 중인 계약이 있으면 삭제할 수 없어요. 호실을 팔았다면 '매도'를 골라 주세요."}
            </p>
          </div>
          <div>
            <p className="text-label font-semibold text-ink">종료 사유 (선택)</p>
            <div role="radiogroup" aria-label="종료 사유" className="mt-1.5 flex gap-1 rounded-btn border border-line bg-surface-2 p-1">
              {END_REASONS.map(({ label: reason }) => {
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
    <Card className="space-y-4 p-5">
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

      {!isEditing && (getUnitTypeLabel(ownership.unitType) || formatEquipment(ownership.equipment, ownership.equipmentEtc)) && (
        <dl className="divide-y divide-line">
          <InfoRow label="방 구성" value={getUnitTypeLabel(ownership.unitType)} optional />
          <InfoRow label="설비" value={formatEquipment(ownership.equipment, ownership.equipmentEtc)} optional />
        </dl>
      )}
      {!isEditing && ownership.isActive && !getUnitTypeLabel(ownership.unitType) && !formatEquipment(ownership.equipment, ownership.equipmentEtc) && (
        <button
          type="button"
          onClick={startEdit}
          className="flex w-full items-center gap-3 rounded-input border border-dashed border-dash px-4 py-3 text-left text-sub text-ink-3 transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={16} aria-hidden="true" />
          방 구성·설비를 넣으면 계약할 때 편해요 (선택)
        </button>
      )}
      {!isEditing && !ownership.isActive && !getUnitTypeLabel(ownership.unitType) && !formatEquipment(ownership.equipment, ownership.equipmentEtc) && (
        <p className="text-sub text-ink-3">입력한 방 구성·설비가 없어요.</p>
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

const LOG_SECTION_SIZE = 5;

// 이 호실의 최근 관리 로그(S-01): 날짜 타일 + 제목·칩·내용 한 줄. 기록 추가는 지금 소유 중일 때만.
const LogSection = ({ propertyId, canAdd, onNavigate, onUnauthorized }) => {
  const logList = useGetManagementLogList({ propertyId, size: LOG_SECTION_SIZE }, { onUnauthorized });
  const logs = logList.data?.items ?? [];

  return (
    <section className="property-detail-page__log-area space-y-4 rounded-card border border-line bg-surface p-5" aria-labelledby="log-area-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="log-area-title" className="flex items-center gap-2 text-section font-semibold text-ink">
          <History size={20} className="text-ink-3" aria-hidden="true" />
          관리 로그
        </h2>
        <span className="flex gap-2">
          {logs.length > 0 && (
            <Button variant="secondary" size="h44" onClick={() => onNavigate('logs', { propertyId })}>
              전체 보기
            </Button>
          )}
          {canAdd && (
            <Button variant="secondary" size="h44" onClick={() => onNavigate('propertyLogRegister', { propertyId, fromPage: true })}>
              <Plus size={16} className="-ml-0.5 mr-1 inline-block" />
              기록 추가
            </Button>
          )}
        </span>
      </div>
      {logList.error && <NoticeBox>{logList.error.message}</NoticeBox>}
      {logList.isLoading && !logList.data && <p className="text-body text-ink-3">불러오는 중입니다</p>}
      {logList.data && logs.length === 0 && <p className="text-body text-ink-3">아직 관리 로그가 없어요</p>}
      <ol className="space-y-3">
        {logs.map((log) => (
          <li key={log.id}>
            <button
              type="button"
              onClick={() => onNavigate('logDetail', { logId: log.id })}
              className="flex w-full items-start gap-3 text-left"
            >
              <DateTile date={log.occurredOn} />
              <span className="min-w-0 flex-1 rounded-input border border-line px-4 py-3 transition-colors hover:bg-surface-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-semibold text-ink">{log.title}</span>
                  <ManagementLogBadges log={log} />
                </span>
                {log.content && <span className="mt-1 block truncate text-body text-ink-2">{log.content}</span>}
              </span>
              <span className="w-24 shrink-0 pt-3 text-right font-num text-body tabular-nums text-ink-2">{log.cost != null ? formatWon(log.cost) : ''}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};

// 호실 상세. 소유 정보·임대 조건·계약은 내 소유 관계(myRelation.ownershipId)가 있을 때만 불러온다.
// isVerifyOpen: /properties/:id/verify 로 들어오면 권리자 인증 팝업을 띄운다(onCloseVerify로 닫는다).
// isLogModalOpen: /properties/:id/logs/new 로 들어오면 이 호실로 고정한 기록 추가 팝업을 띄운다. 저장하면 관리 로그를 새로 고친다.
export const PropertyDetailPage = ({
  propertyId,
  focusContractId,
  isVerifyOpen = false,
  verifyNotice,
  onCloseVerify,
  isLogModalOpen = false,
  onCloseLogModal,
  verifiedLegalDongCodes,
  onVerified,
  onNavigate,
  onUnauthorized,
}) => {
  const hookOptions = { onUnauthorized };
  const propertyQuery = useGetProperty(propertyId, hookOptions);
  const property = propertyQuery.data;
  const complexQuery = useGetComplex(property?.complex.id, hookOptions);
  const ownershipQuery = useGetPropertyOwnership(property?.myRelation?.ownershipId, hookOptions);
  const renewal = useGetOwnershipRenewalNoticeList({ verifiedLegalDongCodes }, hookOptions);
  const { refetch: refetchProperty } = propertyQuery;
  const { refetch: refetchOwnership } = ownershipQuery;
  const { refetch: refetchRenewal } = renewal;

  // 인증 화면을 나가도 인증은 계속되므로 여기서도 진행 상태를 읽고, 끝나면 화면을 맞춘다.
  const handleVerificationFinished = useCallback(
    (attempt) => {
      refetchProperty();
      refetchOwnership();
      if (attempt.status === 'VERIFIED') {
        refetchRenewal();
        onVerified?.();
      }
    },
    [refetchProperty, refetchOwnership, refetchRenewal, onVerified],
  );
  const activeOwnershipId = property?.myRelation?.type === 'OWNER' ? property.myRelation.ownershipId : undefined;
  const latestAttempt = useGetLatestOwnershipVerification(activeOwnershipId, {
    onFinished: handleVerificationFinished,
    onUnauthorized,
  });

  const goBack = () => window.history.back();
  const [logReloadKey, setLogReloadKey] = useState(0);

  if (!property) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="호실 상세" />
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
  const address = complexQuery.data?.roadAddress ?? complexQuery.data?.jibunAddress;
  const ownership = ownershipQuery.data;

  // 호실 상세 = 워크스페이스: 본문(계약 영역·관리 로그) + 오른쪽 보조 패널(권리자 인증·호실 정보·임대 조건·내 소유 정보).
  // 버튼은 각 영역 안에만 둔다(머리에는 호실 이름·주소·상태만).
  return (
    <div className="property-detail-page w-full space-y-5 pb-10">
      <header className="property-detail-page__header flex items-start gap-4">
        <IconTile icon={Building2} tone="accent" size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-h1 font-semibold text-ink">{property.displayName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {address && (
              <span className="inline-flex items-center gap-1 text-sub text-ink-3">
                <MapPin size={13} aria-hidden="true" />
                {address}
              </span>
            )}
            <Badge tone={status.tone}>{status.label}</Badge>
            {property.myRelation?.type === 'OWNER' && <Badge tone={verification.tone}>{verification.label}</Badge>}
          </div>
        </div>
      </header>
      {propertyQuery.error && <NoticeBox>{propertyQuery.error.message}</NoticeBox>}
      {complexQuery.error && <NoticeBox>{complexQuery.error.message}</NoticeBox>}
      {ownershipQuery.error && <NoticeBox>{ownershipQuery.error.message}</NoticeBox>}

      <div className="grid grid-cols-3 items-start gap-5">
        <div className="col-span-2 space-y-5">
          {property.myRelation?.ownershipId && (
            <PropertyContractArea
              propertyId={property.id}
              ownershipId={property.myRelation.ownershipId}
              canRegister={property.myRelation.type === 'OWNER' && property.myRelation.verificationStatus === 'VERIFIED'}
              focusContractId={focusContractId}
              onNavigate={onNavigate}
              onUnauthorized={onUnauthorized}
            />
          )}
          {property.myRelation?.ownershipId && (
            <LogSection
              key={logReloadKey}
              propertyId={property.id}
              canAdd={property.myRelation.type === 'OWNER'}
              onNavigate={onNavigate}
              onUnauthorized={onUnauthorized}
            />
          )}
        </div>

        <aside className="property-detail-page__side-panel-stack space-y-5">
          {ownership && (
            <VerificationPanel
              ownership={ownership}
              attempt={latestAttempt.data}
              isAttemptRunning={latestAttempt.isActive}
              renewalNotice={renewal.notices.find((notice) => notice.id === ownership.id)}
              onVerify={() => onNavigate('propertyVerify', { propertyId: property.id, fromDetail: true })}
              onInquiry={() => onNavigate('supportInquiry')}
            />
          )}
          <BasicInfoSection property={property} complex={complexQuery.data} onSaved={propertyQuery.refetch} onUnauthorized={onUnauthorized} />
          {ownership && (
            <ListingSection key={`listing-${ownership.id}`} ownership={ownership} onSaved={ownershipQuery.refetch} onUnauthorized={onUnauthorized} />
          )}
          {ownership && (
            <OwnershipSection
              key={ownership.id}
              ownership={ownership}
              onSaved={ownershipQuery.refetch}
              // 들어온 화면(내 부동산·홈 등)으로 돌아간다. 그 화면은 다시 열리면서 새 목록을 불러온다.
              onEnded={goBack}
              onUnauthorized={onUnauthorized}
            />
          )}
        </aside>
      </div>

      {isLogModalOpen && (
        <LogFormModal
          fixedPropertyId={property.id}
          onClose={onCloseLogModal}
          onSaved={() => {
            setLogReloadKey((prev) => prev + 1);
            onCloseLogModal();
          }}
          onUnauthorized={onUnauthorized}
        />
      )}
      {isVerifyOpen && (
        <VerifyModal
          propertyName={property.displayName}
          ownership={activeOwnershipId ? ownership : undefined}
          isNotOwner={!activeOwnershipId}
          latest={latestAttempt}
          notice={verifyNotice}
          onClose={onCloseVerify}
          onInquiry={() => onNavigate('supportInquiry')}
          onRegisterAnother={() => onNavigate('propertyRegister')}
          onRevoked={refetchOwnership}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  );
};

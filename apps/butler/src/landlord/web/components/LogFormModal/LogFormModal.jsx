import { useState } from 'react';
import { Badge, Button, PageSkeleton, RequiredMark } from '@butler/ui';
import { History, Pencil, ShieldCheck } from 'lucide-react';
import { PrivateChip } from '../ManagementLogBadges/ManagementLogBadges';
import { Modal } from '../Modal/Modal';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import {
  isAttachmentReady,
  isLogFormComplete,
  ManagementLogForm,
  toLogFields,
  toLogForm,
  validateLogForm,
} from '../ManagementLogForm/ManagementLogForm';
import { useAttachmentUploads } from '../../../../shared/upload/useAttachmentUploads';
import { useGetManagementLog } from '../../hooks/useGetManagementLog';
import { useGetPropertyList } from '../../hooks/useGetPropertyList';
import { usePatchManagementLog } from '../../hooks/usePatchManagementLog';
import { usePostManagementLog } from '../../hooks/usePostManagementLog';
import { toFieldErrors } from '../../../../shared/apiError';
import { getTodayKST } from '../../utils/contract';
import {
  getLogScopeBadge,
  HISTORY_NOTICE,
  SOLD_PRIVATE_NOTICE,
  HISTORY_ONLY_TYPES,
  SCOPE_LABEL,
  UNVERIFIED_LOG_WARNING,
  UNVERIFIED_PRIVATE_NOTICE,
} from '../../utils/managementLog';

// 호실 선택은 내 활성 소유 호실 전부(목록 API 최대 크기)
const PROPERTY_PICKER_SIZE = 100;

const UploadStatus = ({ uploads }) => (
  <>
    {uploads.isUploading && <p className="text-chip text-ink-3">사진을 올리는 중이에요. 끝나면 저장할 수 있어요.</p>}
    {uploads.hasFailed && <p className="text-chip text-crit-ink">올리지 못한 사진을 빼고 저장해 주세요.</p>}
  </>
);

const footerButtons = ({ onClose, onSubmit, isReady, isSubmitting, label }) => (
  <>
    <Button variant="secondary" size="h44" onClick={onClose} disabled={isSubmitting}>
      취소
    </Button>
    <Button size="h44" onClick={onSubmit} disabled={!isReady || isSubmitting}>
      {isSubmitting ? '저장 중' : label}
    </Button>
  </>
);

// 기록 추가(S-02). fixedPropertyId가 있으면 그 호실로 고정(호실 상세에서), 없으면 호실을 고른다.
// initialPropertyId: 하우스 로그의 호실 필터처럼 미리 고를 호실(바꿀 수 있다).
// 공개 범위는 고르지 않는다 — 서버가 정한다(H-29): 인증 전엔 모두 나만 보기, 인증 뒤 수리·점검은 호실 이력,
// 메모는 [나만 보기]를 체크하지 않으면 호실 이력(keepPrivate).
const CreateLogModal = ({ fixedPropertyId, initialPropertyId, onClose, onSaved, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const propertyList = useGetPropertyList({ relation: 'OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  // 매도한 호실도 목록에서 지우기 전까지 나만 보기 기록을 남긴다(H-41). 서버가 매도로 끝난 관계만 받는다.
  const formerList = useGetPropertyList({ relation: 'FORMER_OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  const create = usePostManagementLog(hookOptions);
  const uploads = useAttachmentUploads([], hookOptions);
  const ownedItems = propertyList.data?.items ?? [];
  const ownedIds = new Set(ownedItems.map((item) => item.id));
  const formerItems = (formerList.data?.items ?? []).filter((item) => !ownedIds.has(item.id));
  const properties = [...ownedItems, ...formerItems];

  const [propertyId, setPropertyId] = useState(fixedPropertyId ?? initialPropertyId ?? '');
  const [keepPrivate, setKeepPrivate] = useState(false);
  const [form, setForm] = useState({ type: 'REPAIR', room: '', title: '', content: '', occurredOn: getTodayKST(), cost: '' });
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  const property = properties.find((item) => item.id === propertyId);
  const isFormer = Boolean(property) && !ownedIds.has(property.id);
  const isVerified = !isFormer && property?.myRelation?.verificationStatus === 'VERIFIED';
  const isNote = !HISTORY_ONLY_TYPES.includes(form.type);
  const clientErrors = validateLogForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];
  const isSubmitting = create.isLoading;
  const isReady = Boolean(property) && isLogFormComplete(form) && Object.keys(clientErrors).length === 0 && isAttachmentReady(uploads);
  const isPropertyMissing = propertyList.data && formerList.data && propertyId && !property;

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setServerFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async () => {
    if (!isReady || isSubmitting) return;
    const { data, error } = await create.mutate(propertyId, {
      ...toLogFields(form),
      // 나만 보기 체크는 메모에만 있다(수리·점검에 보내면 400).
      ...(isNote && keepPrivate && !isFormer ? { keepPrivate: true } : {}),
      attachmentDocumentIds: uploads.documentIds,
    });
    if (data) {
      onSaved(data);
      return;
    }
    if (error?.status === 400) setServerFieldErrors(toFieldErrors(error));
  };

  const propertyField = fixedPropertyId ? null : (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="log-property" className="text-label font-semibold text-ink">
        호실
        <RequiredMark />
      </label>
      <select
        id="log-property"
        aria-required="true"
        value={propertyId}
        onChange={(event) => setPropertyId(event.target.value)}
        disabled={!propertyList.data || isSubmitting}
        className="h-12 rounded-input border border-line bg-surface px-3 text-card text-ink outline-none focus:border-accent disabled:bg-surface-2"
      >
        <option value="" disabled>
          {propertyList.data ? '기록할 호실을 선택해 주세요' : '불러오는 중'}
        </option>
        {properties.map((item) => (
          <option key={item.id} value={item.id}>
            {ownedIds.has(item.id) ? item.displayName : `${item.displayName} (매도)`}
          </option>
        ))}
      </select>
      {propertyList.error && <p className="text-chip text-crit-ink">{propertyList.error.message}</p>}
      {isPropertyMissing && <p className="text-chip text-crit-ink">내 호실 중에 없어요.</p>}
      {propertyList.data && properties.length === 0 && <p className="text-chip text-ink-3">먼저 호실을 등록해 주세요</p>}
    </div>
  );
  // 수리·점검: 안내 한 줄(인증 전이면 나만 보기 칩). 메모: [나만 보기] 체크(기본 해제).
  let scopeContent;
  if (isFormer) {
    scopeContent = (
      <p className="flex min-h-11 items-center gap-2 text-sub text-ink-2">
        <PrivateChip />
        {SOLD_PRIVATE_NOTICE}
      </p>
    );
  } else if (isNote) {
    scopeContent = (
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body text-ink">
        <input
          type="checkbox"
          className="accent-accent"
          checked={keepPrivate}
          onChange={(event) => setKeepPrivate(event.target.checked)}
          disabled={isSubmitting}
        />
        {SCOPE_LABEL.PRIVATE}
      </label>
    );
  } else if (isVerified || !property) {
    scopeContent = <p className="flex min-h-11 items-center text-sub text-ink-2">{HISTORY_NOTICE}</p>;
  } else {
    scopeContent = (
      <p className="flex min-h-11 items-center">
        <PrivateChip />
      </p>
    );
  }
  const scopeField = (
    <div className="flex flex-col gap-1.5">
      <span className="text-label font-semibold text-ink">공개 범위</span>
      {scopeContent}
      {isNote && isVerified && !keepPrivate && <p className="text-chip text-ink-3">{HISTORY_NOTICE}</p>}
      {fieldError('scope') && <p className="text-chip text-crit-ink">{fieldError('scope')}</p>}
      {fieldError('keepPrivate') && <p className="text-chip text-crit-ink">{fieldError('keepPrivate')}</p>}
    </div>
  );

  return (
    <Modal
      size="lg"
      title="기록 추가"
      subtitle={property ? property.displayName : '호실을 골라 주세요'}
      icon={History}
      onClose={onClose}
      footer={footerButtons({ onClose, onSubmit: handleSubmit, isReady, isSubmitting, label: '기록 저장' })}
    >
      <div className="space-y-4">
        <ManagementLogForm
          form={form}
          onChange={updateField}
          fieldError={fieldError}
          uploads={uploads}
          onUnauthorized={onUnauthorized}
          disabled={isSubmitting}
          propertyField={propertyField}
          scopeField={scopeField}
        />
        {property && !isVerified && !isFormer && (
          <NoticeBox tone="warn">
            <p>{UNVERIFIED_PRIVATE_NOTICE}</p>
            <p>{UNVERIFIED_LOG_WARNING}</p>
          </NoticeBox>
        )}
        <UploadStatus uploads={uploads} />
        {create.error && Object.keys(serverFieldErrors).length === 0 && <NoticeBox>{create.error.message}</NoticeBox>}
      </div>
    </Modal>
  );
};

const EditLogBody = ({ log, onClose, onSaved, onUnauthorized }) => {
  const update = usePatchManagementLog({ onUnauthorized });
  const uploads = useAttachmentUploads(log.attachments, { onUnauthorized });
  const [form, setForm] = useState(() => toLogForm(log));
  const [serverFieldErrors, setServerFieldErrors] = useState({});
  const scope = getLogScopeBadge(log.scope);
  const isTypeLocked = log.type === 'TICKET_SUMMARY';
  const clientErrors = validateLogForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];
  const isReady = isLogFormComplete(form) && Object.keys(clientErrors).length === 0 && isAttachmentReady(uploads);

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setServerFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async () => {
    if (!isReady || update.isLoading) return;
    // 첨부는 최종 목록을 보낸다(뺀 사진은 서버가 지우고 새 사진은 붙인다).
    // 수리 요청 완료 기록은 유형을 바꿀 수 없어 보내지 않는다(H-47).
    const { type, ...fields } = toLogFields(form);
    const body = { ...fields, ...(isTypeLocked ? {} : { type }), attachmentDocumentIds: uploads.documentIds };
    const { data, error } = await update.mutate(log.id, body);
    if (data) {
      onSaved(data);
      return;
    }
    if (error?.status === 400) setServerFieldErrors(toFieldErrors(error));
  };

  // 공개 범위는 정한 뒤 바꿀 수 없어 보기만 한다.
  const scopeField = (
    <div className="flex flex-col gap-1.5">
      <span className="text-label font-semibold text-ink">공개 범위</span>
      <p className="flex h-12 items-center gap-2 rounded-input bg-surface-2 px-3.5 text-body text-ink-3">
        <ShieldCheck size={15} aria-hidden="true" />
        {log.scope === 'PRIVATE' ? <PrivateChip /> : <Badge tone={scope.tone}>{scope.label}</Badge>}
        바꿀 수 없어요
      </p>
    </div>
  );

  return (
    <Modal
      size="lg"
      title="기록 수정"
      subtitle={log.property.displayName}
      icon={Pencil}
      onClose={onClose}
      footer={footerButtons({ onClose, onSubmit: handleSubmit, isReady, isSubmitting: update.isLoading, label: '저장' })}
    >
      <div className="space-y-4">
        <ManagementLogForm
          form={form}
          onChange={updateField}
          fieldError={fieldError}
          uploads={uploads}
          onUnauthorized={onUnauthorized}
          disabled={update.isLoading}
          scopeField={scopeField}
          isTypeLocked={isTypeLocked}
        />
        <UploadStatus uploads={uploads} />
        {update.error && Object.keys(serverFieldErrors).length === 0 && <NoticeBox>{update.error.message}</NoticeBox>}
      </div>
    </Modal>
  );
};

// 기록 수정(S-03). 읽기 전용 기록은 폼을 열지 않는다.
const EditLogModal = ({ logId, onClose, onSaved, onUnauthorized }) => {
  const { data: log, error } = useGetManagementLog(logId, { onUnauthorized });
  if (log && !log.isReadOnly) return <EditLogBody key={log.id} log={log} onClose={onClose} onSaved={onSaved} onUnauthorized={onUnauthorized} />;
  return (
    <Modal size="lg" title="기록 수정" icon={Pencil} onClose={onClose}>
      {error && <NoticeBox>{error.message}</NoticeBox>}
      {!log && !error && <PageSkeleton variant="text" rows={5} />}
      {log?.isReadOnly && <NoticeBox>이 기록은 수정할 수 없어요.</NoticeBox>}
    </Modal>
  );
};

// 기록 추가·수정 팝업 하나(하우스 로그·호실 상세 공용). logId가 있으면 수정, 없으면 추가.
// onSaved(log): 저장한 기록을 받아 목록을 새로 고치고 팝업을 닫는다.
export const LogFormModal = ({ logId, ...props }) => (logId ? <EditLogModal logId={logId} {...props} /> : <CreateLogModal {...props} />);

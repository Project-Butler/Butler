import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, MobileFormLayout, TextField } from '@butler/ui';
import { getContractList, getTicket, patchTicket, postTicket } from '@butler/api-client';
import { Lock } from 'lucide-react';
import { isUnauthorizedError, toApiError, toFieldErrors } from '../../shared/apiError';
import { ROOM_OPTIONS } from '../../shared/room';
import { TICKET_CATEGORY_OPTIONS } from '../../shared/ticketLabels';
import { useAttachmentUploads } from '../../shared/upload/useAttachmentUploads';
import { TicketAttachmentField } from '../components/TicketAttachmentField/TicketAttachmentField';
import { useLoad } from '../hooks/useLoad';
import { ticketPath, ticketSentPath, TICKETS_PATH } from '../routes';
import { buildTicketChanges, canChangeTicket, toRequestableHomes } from '../utils/tickets';

const CONTRACT_PARAMS = { sort: 'endDate:asc', size: 50 };
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 3000;
const SELECT_CLASS = 'h-12 w-full rounded-input border border-line bg-surface px-3.5 text-body text-ink outline-none focus:border-accent';
const TEXTAREA_CLASS =
  'min-h-28 w-full rounded-input border border-line bg-surface px-3.5 py-3 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2';
const PICK_CLASS = 'flex h-9 items-center rounded-full border px-3.5 text-m-label';

const FieldLabel = ({ children, htmlFor, optional = false }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-m-label font-semibold text-ink-2">
    {children}
    {optional && <span className="font-normal text-ink-3"> (선택)</span>}
  </label>
);

const FieldError = ({ children }) => (children ? <p className="mt-1 text-m-sub text-crit-ink">{children}</p> : null);

// 칩 하나 고르기(분류·방). allowEmpty 면 고른 칩을 다시 누르면 빠진다(방은 선택).
const PickGroup = ({ label, options, value, onChange, disabled, allowEmpty = false }) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((option) => {
      const selected = value === option.value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabled}
          onClick={() => onChange(selected && allowEmpty ? '' : option.value)}
          className={`${PICK_CLASS} ${selected ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-surface font-medium text-ink-2'}`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

// 임차인 수리 요청하기 / 고치기(시안 v2.2 ③). ticketId 가 있으면 고치기: 접수(OPEN)일 때만 제목·설명·방(사진은 그대로).
// 보내면 '요청을 보냈어요'(④)로, 고치면 상세로 간다.
export const TicketFormPage = ({ onUnauthorized }) => {
  const { ticketId } = useParams();
  const isEdit = Boolean(ticketId);
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = () => (location.key === 'default' ? navigate(isEdit ? ticketPath(ticketId) : TICKETS_PATH, { replace: true }) : navigate(-1));

  const contracts = useLoad(isEdit ? null : 'tenant-contracts', () => getContractList(CONTRACT_PARAMS).then((body) => body.data ?? []), {
    onUnauthorized,
  });
  const existing = useLoad(isEdit ? `tenant-ticket:${ticketId}` : null, () => getTicket(ticketId), { onUnauthorized });
  const uploads = useAttachmentUploads([], { onUnauthorized, resourceType: 'TICKET' });

  const [form, setForm] = useState({ propertyId: '', category: 'REPAIR', room: '', title: '', description: '' });
  const [submit, setSubmit] = useState({ isLoading: false, error: null });

  const homes = toRequestableHomes(contracts.data ?? []);
  // 집이 하나면 고정한다. 여러 개면 고르게 한다.
  useEffect(() => {
    if (!isEdit && homes.length === 1 && !form.propertyId) setForm((prev) => ({ ...prev, propertyId: homes[0].propertyId }));
  }, [isEdit, homes, form.propertyId]);
  useEffect(() => {
    if (existing.data) {
      setForm({ propertyId: existing.data.propertyId, category: existing.data.category, room: existing.data.room ?? '', title: existing.data.title, description: existing.data.description });
    }
  }, [existing.data]);

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const serverErrors = toFieldErrors(submit.error);
  const locked = isEdit && existing.data && !canChangeTicket(existing.data);
  const changes = isEdit && existing.data ? buildTicketChanges(existing.data, form) : {};
  const isReady = isEdit
    ? existing.data && !locked && Object.keys(changes).length > 0 && form.title.trim() && form.description.trim()
    : form.propertyId && form.category && form.title.trim() && form.description.trim() && !uploads.isUploading && !uploads.hasFailed;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isReady || submit.isLoading) return;
    setSubmit({ isLoading: true, error: null });
    try {
      if (isEdit) {
        await patchTicket(ticketId, changes);
        navigate(ticketPath(ticketId), { replace: true });
      } else {
        const created = await postTicket({
          propertyId: form.propertyId,
          category: form.category,
          ...(form.room ? { room: form.room } : {}),
          title: form.title.trim(),
          description: form.description.trim(),
          attachmentDocumentIds: uploads.documentIds,
        });
        navigate(ticketSentPath(created.id), { replace: true });
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onUnauthorized?.();
        return;
      }
      setSubmit({ isLoading: false, error: toApiError(error) });
    }
  };

  const busy = submit.isLoading;
  const loadError = contracts.error ?? existing.error;
  const submitLabel = isEdit ? (busy ? '고치는 중' : '고친 내용 저장') : busy ? '보내는 중' : uploads.isUploading ? '올리는 중' : '요청 보내기';

  return (
    <MobileFormLayout
      shell="tenant-form"
      topBar={{ title: isEdit ? '요청 고치기' : '수리 요청하기', onBack: goBack }}
      onSubmit={handleSubmit}
      cta={
        <Button type="submit" size="h52" className="flex-1" disabled={!isReady || busy}>
          {submitLabel}
        </Button>
      }
    >
      {loadError && (
        <Card>
          <p role="alert" className="text-body text-crit-ink">
            {loadError.status === 404 ? '요청을 찾을 수 없어요.' : loadError.message}
          </p>
        </Card>
      )}
      {locked && (
        <Card>
          <p role="alert" className="text-body text-ink-2">
            임대인이 처리를 시작해서 고칠 수 없어요.
          </p>
        </Card>
      )}
      {!isEdit && contracts.data && homes.length === 0 && (
        <Card>
          <p className="text-m-card font-semibold text-ink">수리 요청을 보낼 집이 없어요</p>
          <p className="mt-1 text-body text-ink-2">시작 전이거나 진행 중인 계약이 연결돼야 요청할 수 있어요.</p>
        </Card>
      )}

      {!isEdit && homes.length > 0 && (
        <div>
          <FieldLabel htmlFor="ticket-home">집</FieldLabel>
          {homes.length === 1 ? (
            <p id="ticket-home" className="flex min-h-12 items-center justify-between rounded-input border border-line bg-surface-2 px-3.5 text-body text-ink-2">
              {homes[0].displayName}
              <Lock size={16} strokeWidth={1.8} className="text-ink-3" aria-label="고정" />
            </p>
          ) : (
            <select
              id="ticket-home"
              value={form.propertyId}
              disabled={busy}
              onChange={(event) => updateField('propertyId', event.target.value)}
              className={SELECT_CLASS}
            >
              <option value="" disabled>
                집 선택
              </option>
              {homes.map((home) => (
                <option key={home.propertyId} value={home.propertyId}>
                  {home.displayName}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1.5 text-m-sub text-ink-3">시작 전·진행 중인 계약이 하나면 고정, 여러 개면 여기서 골라요.</p>
          <FieldError>{serverErrors.propertyId}</FieldError>
        </div>
      )}

      {isEdit && existing.data && <p className="text-m-sub text-ink-3">{existing.data.property?.displayName}</p>}

      {!isEdit && (
        <div>
          <FieldLabel>무엇을 요청할까요</FieldLabel>
          <PickGroup label="분류" options={TICKET_CATEGORY_OPTIONS} value={form.category} onChange={(value) => updateField('category', value)} disabled={busy} />
          <FieldError>{serverErrors.category}</FieldError>
        </div>
      )}

      {(!isEdit || existing.data) && (
        <>
          <div>
            <FieldLabel optional>어디인가요</FieldLabel>
            <PickGroup label="방" options={ROOM_OPTIONS} value={form.room} onChange={(value) => updateField('room', value)} disabled={busy || locked} allowEmpty />
            <FieldError>{serverErrors.room}</FieldError>
          </div>

          <TextField
            mobile
            required
            label="제목"
            value={form.title}
            maxLength={MAX_TITLE_LENGTH}
            disabled={busy || locked}
            placeholder="예) 싱크대 아래 물이 새요"
            error={serverErrors.title}
            onChange={(event) => updateField('title', event.target.value)}
          />

          <div>
            <FieldLabel htmlFor="ticket-description">자세히 알려 주세요</FieldLabel>
            <textarea
              id="ticket-description"
              aria-required="true"
              value={form.description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              disabled={busy || locked}
              placeholder="증상, 언제부터인지, 방문 가능한 시간 등을 적어 주세요"
              onChange={(event) => updateField('description', event.target.value)}
              className={TEXTAREA_CLASS}
            />
            <FieldError>{serverErrors.description}</FieldError>
          </div>
        </>
      )}

      {!isEdit && <TicketAttachmentField uploads={uploads} disabled={busy} />}

      {submit.error && !Object.keys(serverErrors).length && (
        <p role="alert" className="text-m-sub text-crit-ink">
          {submit.error.status === 404 ? '이 집에는 지금 요청할 수 없어요. 계약 상태를 확인해 주세요.' : submit.error.message}
        </p>
      )}
    </MobileFormLayout>
  );
};

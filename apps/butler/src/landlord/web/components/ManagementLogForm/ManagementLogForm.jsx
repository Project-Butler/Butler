import { Badge, SegmentedControl, TextField } from '@butler/ui';
import { AttachmentPicker } from '../AttachmentPicker/AttachmentPicker';
import { formatNumber } from '../../utils/format';
import { getLogTypeLabel, WRITABLE_TYPE_OPTIONS } from '../../utils/managementLog';
import { ROOM_OPTIONS } from '../../../../shared/room';

// 서버 검증(apps/api managementLogs controller)과 같은 범위
const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 5000;

export const toLogForm = (log) => ({
  type: log.type,
  room: log.room ?? '',
  title: log.title,
  content: log.content ?? '',
  occurredOn: log.occurredOn,
  cost: log.cost == null ? '' : String(log.cost),
});

export const validateLogForm = (form) => {
  const errors = {};
  if (form.title.trim().length > MAX_TITLE_LENGTH) errors.title = `제목은 ${MAX_TITLE_LENGTH}자까지 쓸 수 있어요.`;
  return errors;
};

export const isLogFormComplete = (form) => Boolean(form.title.trim() && form.occurredOn);

export const toLogFields = (form) => ({
  type: form.type,
  // 방은 선택(빈 값 = 방 없음 null)
  room: form.room || null,
  title: form.title.trim(),
  content: form.content.trim() || null,
  occurredOn: form.occurredOn,
  cost: form.cost === '' ? null : Number(form.cost),
});

// 사진을 올리는 중이거나 실패한 사진이 남아 있으면 저장하지 않는다(빼거나 끝날 때까지).
export const isAttachmentReady = (uploads) => !uploads.isUploading && !uploads.hasFailed;

// 방 고르기(하나만): 선택 안 함 + 9가지(H-02). 누르는 칸 40px.
const RoomPicker = ({ value, onChange, disabled }) => {
  const options = [{ value: '', label: '선택 안 함' }, ...ROOM_OPTIONS];
  return (
    <div className="flex flex-col gap-1.5">
      <span id="log-room-label" className="text-label font-semibold text-ink">
        방 (선택)
      </span>
      <div role="radiogroup" aria-labelledby="log-room-label" className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <button
              key={option.value || 'none'}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`inline-flex h-10 items-center rounded-full border px-3.5 text-label transition-colors disabled:opacity-60 ${
                checked ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-surface font-medium text-ink-2 hover:bg-surface-2'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// 유형·방·제목·내용·날짜·비용·사진 입력. 호실·공개 범위 칸은 쓰는 화면이 propertyField·scopeField로 넘긴다(없으면 생략).
// 팝업 배치(가로 2칸): 호실 / 날짜 · 비용 / 유형 · 공개 범위 / 방 / 제목 / 내용 / 사진.
// uploads: useAttachmentUploads() 반환값. 저장할 때 uploads.documentIds를 attachmentDocumentIds로 보낸다.
// isTypeLocked: 유형을 바꿀 수 없는 기록(수리 요청 완료, H-47) — 유형을 보기만 한다.
export const ManagementLogForm = ({
  form,
  onChange,
  fieldError,
  uploads,
  onUnauthorized,
  disabled = false,
  propertyField = null,
  scopeField = null,
  isTypeLocked = false,
}) => (
  <>
    {propertyField}
    <div className="grid grid-cols-2 items-start gap-4">
      <TextField
        label="날짜"
        required
        type="date"
        className="font-num tabular-nums"
        max="9999-12-31"
        value={form.occurredOn}
        onChange={(event) => onChange('occurredOn', event.target.value)}
        error={fieldError('occurredOn')}
        disabled={disabled}
      />
      <TextField
        label="비용 (선택)"
        numeric
        suffix="원"
        placeholder="350,000"
        value={form.cost === '' ? '' : formatNumber(Number(form.cost))}
        onChange={(event) => onChange('cost', event.target.value.replace(/\D/g, ''))}
        error={fieldError('cost')}
        disabled={disabled}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-semibold text-ink">유형</span>
        {isTypeLocked ? (
          <p className="flex h-12 items-center gap-2 rounded-input bg-surface-2 px-3.5 text-body text-ink-3">
            <Badge>{getLogTypeLabel(form.type)}</Badge>
            바꿀 수 없어요
          </p>
        ) : (
          <SegmentedControl
            ariaLabel="유형"
            options={WRITABLE_TYPE_OPTIONS}
            value={form.type}
            onChange={(value) => onChange('type', value)}
          />
        )}
        {fieldError('type') && <p className="text-chip text-crit-ink">{fieldError('type')}</p>}
      </div>
      {scopeField}
    </div>
    <RoomPicker value={form.room ?? ''} onChange={(value) => onChange('room', value)} disabled={disabled} />
    <TextField
      label="제목"
      required
      placeholder="예: 욕실 배수구 교체"
      maxLength={MAX_TITLE_LENGTH}
      value={form.title}
      onChange={(event) => onChange('title', event.target.value)}
      error={fieldError('title')}
      disabled={disabled}
    />
    <div className="flex flex-col gap-1.5">
      <label htmlFor="log-content" className="text-label font-semibold text-ink">
        내용 (선택)
      </label>
      <textarea
        id="log-content"
        rows={3}
        maxLength={MAX_CONTENT_LENGTH}
        placeholder="작업 내용이나 기억해 둘 내용"
        value={form.content}
        onChange={(event) => onChange('content', event.target.value)}
        disabled={disabled}
        className="rounded-input border border-line bg-surface px-3 py-2.5 text-card text-ink outline-none focus:border-accent disabled:bg-surface-2"
      />
      {fieldError('content') && <p className="text-chip text-crit-ink">{fieldError('content')}</p>}
    </div>
    {uploads && <AttachmentPicker uploads={uploads} disabled={disabled} onUnauthorized={onUnauthorized} previewInPopup />}
    {fieldError('attachmentDocumentIds') && <p className="text-chip text-crit-ink">{fieldError('attachmentDocumentIds')}</p>}
  </>
);

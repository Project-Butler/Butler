import { SegmentedControl, TextField } from '@butler/ui';
import { formatNumber } from '../../utils/format';
import { WRITABLE_TYPE_OPTIONS } from '../../utils/managementLog';

// 서버 검증(apps/api managementLogs controller)과 같은 범위
export const MAX_TITLE_LENGTH = 100;
export const MAX_CONTENT_LENGTH = 5000;

export const toLogForm = (log) => ({
  type: log.type,
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
  title: form.title.trim(),
  content: form.content.trim() || null,
  occurredOn: form.occurredOn,
  cost: form.cost === '' ? null : Number(form.cost),
});

// 유형·제목·내용·날짜·비용 입력. 호실·공개 범위는 쓰는 화면이 따로 그린다.
export const ManagementLogForm = ({ form, onChange, fieldError, disabled = false }) => (
  <>
    <div className="flex flex-col gap-1.5">
      <span className="text-label font-semibold text-ink">유형</span>
      <SegmentedControl
        ariaLabel="유형"
        options={WRITABLE_TYPE_OPTIONS}
        value={form.type}
        onChange={(value) => onChange('type', value)}
        className="max-w-sm"
      />
    </div>
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
        rows={5}
        maxLength={MAX_CONTENT_LENGTH}
        placeholder="작업 내용이나 기억해 둘 내용"
        value={form.content}
        onChange={(event) => onChange('content', event.target.value)}
        disabled={disabled}
        className="rounded-input border border-line bg-surface px-3 py-2.5 text-card text-ink outline-none focus:border-accent disabled:bg-surface-2"
      />
      {fieldError('content') && <p className="text-chip text-crit-ink">{fieldError('content')}</p>}
    </div>
    <div className="grid grid-cols-2 gap-4">
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
        label="비용 (선택, 원)"
        inputMode="numeric"
        className="font-num tabular-nums"
        placeholder="350,000"
        value={form.cost === '' ? '' : formatNumber(Number(form.cost))}
        onChange={(event) => onChange('cost', event.target.value.replace(/\D/g, ''))}
        error={fieldError('cost')}
        disabled={disabled}
      />
    </div>
  </>
);

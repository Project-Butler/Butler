import { useState } from 'react';
import { Badge, Button, FilterChip } from '@butler/ui';
import { toFieldErrors } from '../../../../shared/apiError';
import { AttachmentPicker } from '../../../web/components/AttachmentPicker/AttachmentPicker';
import { NoticeBox } from '../../../web/components/NoticeBox/NoticeBox';
import { useAttachmentUploads } from '../../../../shared/upload/useAttachmentUploads';
import { getTodayKST } from '../../../web/utils/contract';
import { useRenewalNotices } from '../../hooks/useRenewalNotices';
import {
  getRenewalNoticeKindLabel,
  getRenewalNoticeMethodLabel,
  getRenewalNoticeTimingBadge,
  MAX_RENEWAL_NOTICE_ATTACHMENTS,
  RENEWAL_NOTICE_KIND_OPTIONS,
  RENEWAL_NOTICE_MEMO_MAX,
  RENEWAL_NOTICE_METHOD_OPTIONS,
} from '../../utils/scheduleView';
import { BottomSheet, useBottomSheet } from '../BottomSheet/BottomSheet';

const LABEL = 'text-m-label font-semibold text-ink';
const INPUT_CLASS =
  'h-12 w-full rounded-input border border-line bg-surface px-3.5 font-num text-num-body tabular-nums text-ink outline-none focus:border-accent disabled:bg-surface-2';
const TEXTAREA_CLASS =
  'min-h-[88px] w-full rounded-input border border-line bg-surface px-3.5 py-3 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2';

const FieldError = ({ id, children }) =>
  children ? (
    <p id={id} className="text-m-sub text-crit-ink">
      {children}
    </p>
  ) : null;

// 저장된 기록 한 건. [삭제]는 한 번 더 확인한다.
const NoticeItem = ({ notice, disabled, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const timing = getRenewalNoticeTimingBadge(notice.timing);
  return (
    <li className="flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body font-medium text-ink">
          {getRenewalNoticeKindLabel(notice.kind)} · {getRenewalNoticeMethodLabel(notice.method)}
        </span>
        <Badge mobile tone={timing.tone}>
          {timing.label}
        </Badge>
      </div>
      <span className="font-num text-m-sub tabular-nums text-ink-3">
        보냄 {notice.sentOn} · 도달 {notice.deliveredOn ?? '미확인'}
        {notice.attachments?.length ? ` · 증빙 ${notice.attachments.length}개` : ''}
      </span>
      {notice.memo && <p className="whitespace-pre-wrap text-m-sub text-ink-2">{notice.memo}</p>}
      {confirming ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-m-sub text-ink-2">이 기록을 지울까요?</span>
          <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setConfirming(false)}>
            취소
          </Button>
          <Button size="sm" disabled={disabled} onClick={() => onDelete(notice.id)}>
            삭제
          </Button>
        </div>
      ) : (
        <button type="button" disabled={disabled} onClick={() => setConfirming(true)} className="self-end py-1 text-m-sub text-ink-3 underline disabled:opacity-50">
          삭제
        </button>
      )}
    </li>
  );
};

const toBody = (form, documentIds) => ({
  kind: form.kind,
  method: form.method,
  sentOn: form.sentOn,
  deliveredOn: form.deliveredOn || null,
  memo: form.memo.trim() || null,
  attachmentDocumentIds: documentIds,
});

// 기록 전 화면에서 거르는 것(서버도 같은 규칙으로 다시 검사한다).
const validate = (form, today) => {
  const errors = {};
  if (!form.sentOn) errors.sentOn = '보낸 날을 골라 주세요.';
  else if (form.sentOn > today) errors.sentOn = '오늘 이후 날짜는 고를 수 없어요.';
  if (form.deliveredOn) {
    if (form.deliveredOn > today) errors.deliveredOn = '오늘 이후 날짜는 고를 수 없어요.';
    else if (form.sentOn && form.deliveredOn < form.sentOn) errors.deliveredOn = '보낸 날보다 앞설 수 없어요.';
  }
  return errors;
};

// 갱신 거절 통지 기록 시트(#163). 위에는 저장된 기록(최신순)과 삭제, 아래는 새 기록 폼이다.
// 증빙(내용증명 사본·문자 캡처 등)은 먼저 미연결 문서로 올리고 저장할 때 attachmentDocumentIds 로 붙인다.
// readOnly(끝난 계약·끝난 소유 관계)면 폼과 삭제를 두지 않는다. 저장하면 시트를 닫고 onChanged 로 계약을 다시 불러온다.
export const RenewalNoticeSheet = ({ contractId, readOnly = false, onChanged, onClose, onUnauthorized }) => {
  const sheet = useBottomSheet();
  const close = () => sheet.close(onClose);
  const [today] = useState(getTodayKST);
  const notices = useRenewalNotices(contractId, { onChanged, onUnauthorized });
  const uploads = useAttachmentUploads([], { onUnauthorized, maxCount: MAX_RENEWAL_NOTICE_ATTACHMENTS });
  const [form, setForm] = useState({ kind: 'REFUSE_RENEWAL', method: 'CERTIFIED_MAIL', sentOn: today, deliveredOn: '', memo: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);

  const set = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const errors = validate(form, today);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setError(null);
    const apiError = await notices.create(toBody(form, uploads.documentIds));
    if (!apiError) {
      close();
      return;
    }
    setFieldErrors(toFieldErrors(apiError));
    setError(apiError.message);
  };

  const remove = async (noticeId) => {
    setError(null);
    const apiError = await notices.remove(noticeId);
    if (apiError) setError(apiError.message);
  };

  const busy = notices.isMutating;
  const canSubmit = !busy && !uploads.isUploading && !uploads.hasFailed;

  return (
    <BottomSheet label="통지 기록" onClose={onClose} sheet={sheet}>
      <section aria-label="저장된 기록" className="flex flex-col">
        {notices.error && <NoticeBox>{notices.error.message}</NoticeBox>}
        {!notices.data && !notices.error && (
          <p role="status" className="py-3 text-body text-ink-3">
            불러오는 중입니다
          </p>
        )}
        {notices.data?.length === 0 && <p className="text-body text-ink-3">아직 남긴 기록이 없어요.</p>}
        {notices.data?.length > 0 && (
          <ul>
            {notices.data.map((notice) => (
              <NoticeItem key={notice.id} notice={notice} disabled={busy || readOnly} onDelete={remove} />
            ))}
          </ul>
        )}
      </section>

      {readOnly ? (
        <p className="rounded-input bg-surface-2 px-4 py-3 text-m-sub text-ink-2">끝난 계약이라 기록을 더하거나 지울 수 없어요.</p>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-4 border-t border-line pt-4">
          <h3 className="text-body font-semibold text-ink">새 기록</h3>
          <fieldset className="flex flex-col gap-1.5">
            <legend className={`${LABEL} mb-1.5`}>종류</legend>
            <div className="flex flex-wrap gap-2">
              {RENEWAL_NOTICE_KIND_OPTIONS.map((option) => (
                <FilterChip key={option.value} selected={form.kind === option.value} onClick={() => set('kind')(option.value)}>
                  {option.label}
                </FilterChip>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className={`${LABEL} mb-1.5`}>보낸 방법</legend>
            <div className="flex flex-wrap gap-2">
              {RENEWAL_NOTICE_METHOD_OPTIONS.map((option) => (
                <FilterChip key={option.value} selected={form.method === option.value} onClick={() => set('method')(option.value)}>
                  {option.label}
                </FilterChip>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="renewal-notice-sent-on" className={LABEL}>
              보낸 날
            </label>
            <input
              id="renewal-notice-sent-on"
              type="date"
              value={form.sentOn}
              max={today}
              disabled={busy}
              aria-invalid={fieldErrors.sentOn ? true : undefined}
              aria-describedby={fieldErrors.sentOn ? 'renewal-notice-sent-on-error' : undefined}
              onChange={(event) => set('sentOn')(event.target.value)}
              className={INPUT_CLASS}
            />
            <FieldError id="renewal-notice-sent-on-error">{fieldErrors.sentOn}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="renewal-notice-delivered-on" className={LABEL}>
              도달한 날 (선택)
            </label>
            <input
              id="renewal-notice-delivered-on"
              type="date"
              value={form.deliveredOn}
              max={today}
              disabled={busy}
              aria-invalid={fieldErrors.deliveredOn ? true : undefined}
              aria-describedby="renewal-notice-delivered-on-hint"
              onChange={(event) => set('deliveredOn')(event.target.value)}
              className={INPUT_CLASS}
            />
            <p id="renewal-notice-delivered-on-hint" className="text-m-sub text-ink-3">
              등기 배달 조회·답장 등으로 임차인이 받은 걸 확인한 날이에요. 모르면 비워 두고 나중에 다시 기록하세요.
            </p>
            <FieldError>{fieldErrors.deliveredOn}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="renewal-notice-memo" className={LABEL}>
              메모 (선택)
            </label>
            <textarea
              id="renewal-notice-memo"
              value={form.memo}
              maxLength={RENEWAL_NOTICE_MEMO_MAX}
              disabled={busy}
              onChange={(event) => set('memo')(event.target.value)}
              placeholder="예) 등기번호 1234-5678-9012"
              className={TEXTAREA_CLASS}
            />
            <FieldError>{fieldErrors.memo}</FieldError>
          </div>
          <AttachmentPicker uploads={uploads} label="증빙 (선택)" disabled={busy} onUnauthorized={onUnauthorized} />
          {error && <NoticeBox>{error}</NoticeBox>}
          <div className="flex gap-2.5">
            <Button variant="secondary" size="h52" onClick={close} disabled={busy}>
              닫기
            </Button>
            <Button type="submit" size="h52" className="flex-1" disabled={!canSubmit}>
              {busy ? '저장 중' : uploads.isUploading ? '증빙 올리는 중' : '기록 저장'}
            </Button>
          </div>
        </form>
      )}
      {readOnly && (
        <Button variant="secondary" size="h52" onClick={close}>
          닫기
        </Button>
      )}
    </BottomSheet>
  );
};

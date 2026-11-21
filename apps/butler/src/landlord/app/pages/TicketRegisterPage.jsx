import { useState } from 'react';
import { Button, MobileFormLayout, RequiredMark, TextField } from '@butler/ui';
import { toFieldErrors } from '../../../shared/apiError';
import { AttachmentPicker } from '../../web/components/AttachmentPicker/AttachmentPicker';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useAttachmentUploads } from '../../web/hooks/useAttachmentUploads';
import { useGetPropertyList } from '../../web/hooks/useGetPropertyList';
import { usePostTicket } from '../../web/hooks/usePostTicket';
import { useGoBack, useGoTo } from '../utils/navigation';
import { TICKET_CATEGORY_OPTIONS } from '../utils/ticketView';

const PROPERTY_PICKER_SIZE = 100;
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 3000;
const SELECT_CLASS =
  'h-12 w-full rounded-input border border-line bg-surface px-3.5 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2 disabled:text-ink-3';
const TEXTAREA_CLASS =
  'min-h-32 w-full rounded-input border border-line bg-surface px-3 py-2.5 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2';

const FieldLabel = ({ children, htmlFor, required = false }) => (
  <label htmlFor={htmlFor} className="text-m-label font-semibold text-ink">
    {children}
    {required && <RequiredMark />}
  </label>
);

const FieldError = ({ children }) => (children ? <p className="text-m-sub text-crit-ink">{children}</p> : null);

// 임대인 앱 수리·점검 요청 등록. 임대인이 직접 챙길 점검·수리를 남긴다(임차인 요청과 같은 목록에 쌓인다).
// 임대인이 만든 요청에는 대화가 열리지 않는다(계약 6장 THREAD_CONTEXT_NOT_SUPPORTED).
export const TicketRegisterPage = ({ propertyId: initialPropertyId, onUnauthorized }) => {
  const goTo = useGoTo();
  const goBack = useGoBack('tickets');
  const owned = useGetPropertyList({ relation: 'OWNER', size: PROPERTY_PICKER_SIZE }, { onUnauthorized });
  // 수리 요청은 사진·PDF와 함께 동영상(MP4·MOV)도 받는다(업로드 규칙의 TICKET).
  const uploads = useAttachmentUploads([], { onUnauthorized, resourceType: 'TICKET' });
  const { createTicket, isLoading: isSubmitting, error } = usePostTicket({ onUnauthorized });
  const [form, setForm] = useState({ propertyId: initialPropertyId ?? '', category: 'REPAIR', title: '', description: '' });

  const properties = owned.data?.items ?? [];
  const serverErrors = toFieldErrors(error);
  const isReady =
    form.propertyId && form.category && form.title.trim() && form.description.trim() && !uploads.isUploading && !uploads.hasFailed;

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isReady || isSubmitting) return;
    const result = await createTicket({
      propertyId: form.propertyId,
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      attachmentDocumentIds: uploads.documentIds,
    });
    if (result.data) goTo('ticketDetail', { ticketId: result.data.id }, { replace: true });
  };

  return (
    <MobileFormLayout
      shell="landlord-app-form"
      topBar={{ title: '수리·점검 등록', onBack: goBack }}
      onSubmit={handleSubmit}
      cta={
        <Button type="submit" size="h52" className="flex-1" disabled={!isReady || isSubmitting}>
          {isSubmitting ? '등록 중' : uploads.isUploading ? '사진 올리는 중' : '등록'}
        </Button>
      }
    >
      {owned.error && <NoticeBox>{owned.error.message}</NoticeBox>}
      {owned.data && properties.length === 0 && <NoticeBox tone="info">소유 중인 호실이 없어요. 부동산을 먼저 등록해 주세요.</NoticeBox>}

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="ticket-property" required>
          호실
        </FieldLabel>
        <select
          id="ticket-property"
          aria-required="true"
          value={form.propertyId}
          disabled={isSubmitting || !owned.data}
          onChange={(event) => updateField('propertyId', event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="" disabled>
            {owned.data ? '호실 선택' : '불러오는 중'}
          </option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.displayName}
            </option>
          ))}
        </select>
        <FieldError>{serverErrors.propertyId}</FieldError>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="ticket-category" required>
          유형
        </FieldLabel>
        <select
          id="ticket-category"
          aria-required="true"
          value={form.category}
          disabled={isSubmitting}
          onChange={(event) => updateField('category', event.target.value)}
          className={SELECT_CLASS}
        >
          {TICKET_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError>{serverErrors.category}</FieldError>
      </div>

      <TextField
        mobile
        required
        label="제목"
        value={form.title}
        maxLength={MAX_TITLE_LENGTH}
        disabled={isSubmitting}
        placeholder="예) 욕실 누수 점검"
        error={serverErrors.title}
        onChange={(event) => updateField('title', event.target.value)}
      />

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="ticket-description" required>
          내용
        </FieldLabel>
        <textarea
          id="ticket-description"
          aria-required="true"
          value={form.description}
          maxLength={MAX_DESCRIPTION_LENGTH}
          disabled={isSubmitting}
          placeholder="증상·위치·희망 일정 등을 적어 주세요"
          onChange={(event) => updateField('description', event.target.value)}
          className={TEXTAREA_CLASS}
        />
        <FieldError>{serverErrors.description}</FieldError>
      </div>

      <AttachmentPicker uploads={uploads} disabled={isSubmitting} onUnauthorized={onUnauthorized} />

      {error && !Object.keys(serverErrors).length && <NoticeBox>{error.message}</NoticeBox>}
    </MobileFormLayout>
  );
};

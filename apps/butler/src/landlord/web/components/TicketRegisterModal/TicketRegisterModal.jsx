import { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { Button, RequiredMark } from '@butler/ui';
import { toFieldErrors } from '../../../../shared/apiError';
import { ROOM_OPTIONS } from '../../../../shared/room';
import { TICKET_CATEGORY_OPTIONS } from '../../../../shared/ticketLabels';
import { useAttachmentUploads } from '../../../../shared/upload/useAttachmentUploads';
import { AttachmentPicker } from '../AttachmentPicker/AttachmentPicker';
import { Modal } from '../Modal/Modal';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { usePostTicket } from '../../hooks/usePostTicket';

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 3000;
const FIELD_CLASS = 'w-full rounded-input border border-line bg-surface px-3.5 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2';

const Field = ({ id, label, required = false, optional = false, error, children }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-label font-semibold text-ink">
      {label}
      {required && <RequiredMark />}
      {optional && <span className="font-normal text-ink-3"> (선택)</span>}
    </label>
    {children}
    {error && <p className="text-sub text-crit-ink">{error}</p>}
  </div>
);

// PC [요청 등록] 팝업(시안 v2.2 ⑥, D6). 임대인이 직접 챙길 수리·점검을 남긴다(임차인에게는 보이지 않고 대화도 열리지 않는다).
// - properties: 고를 수 있는 호실(활성 소유). initialPropertyId: 거르기에서 고른 호실을 미리 고른다.
// - onCreated(ticket): 등록하면 쓰는 쪽이 팝업을 닫고 그 요청을 연다.
export const TicketRegisterModal = ({ properties, initialPropertyId, onClose, onCreated, onUnauthorized }) => {
  const uploads = useAttachmentUploads([], { onUnauthorized, resourceType: 'TICKET' });
  const { createTicket, isLoading: isSubmitting, error } = usePostTicket({ onUnauthorized });
  const [form, setForm] = useState({ propertyId: '', category: 'REPAIR', room: '', title: '', description: '' });
  // 호실 목록이 늦게 와도 미리 고를 호실(거르기에서 고른 호실, 하나뿐이면 그 호실)을 채운다. 사용자가 고른 뒤에는 건드리지 않는다.
  const preset = properties.some((property) => property.id === initialPropertyId) ? initialPropertyId : properties.length === 1 ? properties[0].id : '';
  useEffect(() => {
    if (preset) setForm((prev) => (prev.propertyId ? prev : { ...prev, propertyId: preset }));
  }, [preset]);
  const serverErrors = toFieldErrors(error);
  const isReady = form.propertyId && form.category && form.title.trim() && form.description.trim() && !uploads.isUploading && !uploads.hasFailed;
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!isReady || isSubmitting) return;
    const result = await createTicket({
      propertyId: form.propertyId,
      category: form.category,
      ...(form.room ? { room: form.room } : {}),
      title: form.title.trim(),
      description: form.description.trim(),
      attachmentDocumentIds: uploads.documentIds,
    });
    if (result.data) onCreated(result.data);
  };

  return (
    <Modal
      title="요청 등록"
      subtitle="내가 챙길 수리·점검을 직접 남겨요. 임차인에게는 보이지 않아요."
      icon={Wrench}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="h44" onClick={onClose} disabled={isSubmitting}>
            취소
          </Button>
          <Button size="h44" onClick={handleSubmit} disabled={!isReady || isSubmitting}>
            {isSubmitting ? '등록 중' : uploads.isUploading ? '올리는 중' : '등록'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {properties.length === 0 && <NoticeBox tone="info">소유 중인 호실이 없어요. 부동산을 먼저 등록해 주세요.</NoticeBox>}
        <div className="grid grid-cols-2 gap-3">
          <Field id="ticket-register-property" label="호실" required error={serverErrors.propertyId}>
            <select
              id="ticket-register-property"
              aria-required="true"
              value={form.propertyId}
              disabled={isSubmitting}
              onChange={(event) => update('propertyId', event.target.value)}
              className={`${FIELD_CLASS} h-12`}
            >
              <option value="" disabled>
                호실 선택
              </option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field id="ticket-register-category" label="분류" required error={serverErrors.category}>
            <select
              id="ticket-register-category"
              value={form.category}
              disabled={isSubmitting}
              onChange={(event) => update('category', event.target.value)}
              className={`${FIELD_CLASS} h-12`}
            >
              {TICKET_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="ticket-register-room" label="방" optional error={serverErrors.room}>
          <select id="ticket-register-room" value={form.room} disabled={isSubmitting} onChange={(event) => update('room', event.target.value)} className={`${FIELD_CLASS} h-12`}>
            <option value="">방 없음</option>
            {ROOM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="ticket-register-title" label="제목" required error={serverErrors.title}>
          <input
            id="ticket-register-title"
            aria-required="true"
            value={form.title}
            maxLength={MAX_TITLE_LENGTH}
            disabled={isSubmitting}
            placeholder="예) 겨울 전 보일러 점검"
            onChange={(event) => update('title', event.target.value)}
            className={`${FIELD_CLASS} h-12`}
          />
        </Field>
        <Field id="ticket-register-description" label="내용" required error={serverErrors.description}>
          <textarea
            id="ticket-register-description"
            aria-required="true"
            value={form.description}
            maxLength={MAX_DESCRIPTION_LENGTH}
            disabled={isSubmitting}
            placeholder="증상·위치·희망 일정 등을 적어 주세요"
            onChange={(event) => update('description', event.target.value)}
            className={`${FIELD_CLASS} min-h-24 py-3`}
          />
        </Field>
        <AttachmentPicker uploads={uploads} disabled={isSubmitting} onUnauthorized={onUnauthorized} previewInPopup />
        {error && !Object.keys(serverErrors).length && <NoticeBox>{error.message}</NoticeBox>}
      </div>
    </Modal>
  );
};

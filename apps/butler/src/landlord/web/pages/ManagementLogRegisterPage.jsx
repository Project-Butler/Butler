import { useState } from 'react';
import { Button, Card, RequiredMark, SegmentedControl } from '@butler/ui';
import {
  isAttachmentReady,
  isLogFormComplete,
  ManagementLogForm,
  toLogFields,
  validateLogForm,
} from '../components/ManagementLogForm/ManagementLogForm';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useAttachmentUploads } from '../hooks/useAttachmentUploads';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { usePostManagementLog } from '../hooks/usePostManagementLog';
import { toFieldErrors } from '../utils/apiError';
import { getTodayKST } from '../utils/contract';
import { SCOPE_LABEL, VERIFICATION_REQUIRED_MESSAGE } from '../utils/managementLog';

// 호실 선택은 내 활성 소유 호실 전부(목록 API 최대 크기)
const PROPERTY_PICKER_SIZE = 100;

// 관리 로그 작성(S-02). /logs/new는 호실을 고르고, /properties/:propertyId/logs/new는 그 호실로 고정한다.
export const ManagementLogRegisterPage = ({ propertyId: fixedPropertyId, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const propertyList = useGetPropertyList({ relation: 'OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  const create = usePostManagementLog(hookOptions);
  const uploads = useAttachmentUploads([], hookOptions);
  const properties = propertyList.data?.items ?? [];

  const [propertyId, setPropertyId] = useState(fixedPropertyId ?? '');
  const [scope, setScope] = useState('PRIVATE');
  const [form, setForm] = useState({ type: 'REPAIR', title: '', content: '', occurredOn: getTodayKST(), cost: '' });
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  const property = properties.find((item) => item.id === propertyId);
  const isVerified = property?.myRelation?.verificationStatus === 'VERIFIED';
  // 인증된 호실에서 호실 이력을 골랐다가 미인증 호실로 바꾸면 나만 보기로 돌아간다.
  const effectiveScope = isVerified ? scope : 'PRIVATE';
  const clientErrors = validateLogForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];
  const isSubmitting = create.isLoading;
  const isReady =
    Boolean(property) && isLogFormComplete(form) && Object.keys(clientErrors).length === 0 && isAttachmentReady(uploads);
  const isPropertyMissing = propertyList.data && propertyId && !property;

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setServerFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async () => {
    if (!isReady || isSubmitting) return;
    const { data, error } = await create.mutate(propertyId, {
      scope: effectiveScope,
      ...toLogFields(form),
      attachmentDocumentIds: uploads.documentIds,
    });
    // 작성 화면 기록은 상세로 바꾼다(뒤로 가면 다시 작성 폼이 나오지 않게).
    if (data) {
      onNavigate('logDetail', { logId: data.id }, { replace: true });
      return;
    }
    if (error?.status === 400) setServerFieldErrors(toFieldErrors(error));
  };

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader title="기록 추가" description="호실에 있었던 일을 남겨 두세요." onBack={() => window.history.back()} />

      <div className="grid grid-cols-3 items-start gap-6">
        <Card className="col-span-2 space-y-6 p-6">
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
              disabled={Boolean(fixedPropertyId) || !propertyList.data || isSubmitting}
              className="h-12 rounded-input border border-line bg-surface px-3 text-card text-ink outline-none focus:border-accent disabled:bg-surface-2"
            >
              <option value="" disabled>
                {propertyList.data ? '기록할 호실을 선택해 주세요' : '불러오는 중'}
              </option>
              {properties.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
            {propertyList.error && <p className="text-chip text-crit-ink">{propertyList.error.message}</p>}
            {isPropertyMissing && <p className="text-chip text-crit-ink">지금 소유한 호실 중에 없어요.</p>}
            {propertyList.data && properties.length === 0 && (
              <p className="text-chip text-ink-3">먼저 호실을 등록해 주세요</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-label font-semibold text-ink">공개 범위</span>
            <SegmentedControl
              ariaLabel="공개 범위"
              options={[
                { value: 'PRIVATE', label: SCOPE_LABEL.PRIVATE },
                { value: 'PROPERTY_HISTORY', label: SCOPE_LABEL.PROPERTY_HISTORY, disabled: !isVerified },
              ]}
              value={effectiveScope}
              onChange={setScope}
              className="max-w-sm"
            />
            <p className="text-chip text-ink-3">
              {isVerified
                ? '호실 이력은 다음 소유자에게 넘어가고 지울 수 없어요. 임차인 정보는 적지 말아 주세요. 정한 뒤에는 바꿀 수 없어요.'
                : `호실 이력은 ${VERIFICATION_REQUIRED_MESSAGE}.`}
            </p>
          </div>

          <ManagementLogForm
            form={form}
            onChange={updateField}
            fieldError={fieldError}
            uploads={uploads}
            onUnauthorized={onUnauthorized}
            disabled={isSubmitting}
          />
        </Card>

        <Card className="sticky top-6 space-y-4 p-6">
          <h2 className="text-section font-semibold text-ink">작성 요약</h2>
          <p className="text-body font-semibold text-ink">{property ? property.displayName : '호실을 선택해 주세요'}</p>
          <p className="text-sub text-ink-2">{SCOPE_LABEL[effectiveScope]}</p>
          {uploads.isUploading && <p className="text-chip text-ink-3">사진을 올리는 중이에요. 끝나면 저장할 수 있어요.</p>}
          {uploads.hasFailed && <p className="text-chip text-crit-ink">올리지 못한 사진을 빼고 저장해 주세요.</p>}
          {create.error && Object.keys(serverFieldErrors).length === 0 && <NoticeBox>{create.error.message}</NoticeBox>}
          <Button size="lg" className="w-full" onClick={handleSubmit} disabled={!isReady || isSubmitting}>
            {isSubmitting ? '저장 중' : '기록 저장'}
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => window.history.back()} disabled={isSubmitting}>
            취소
          </Button>
        </Card>
      </div>
    </div>
  );
};

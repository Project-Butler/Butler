import { useState } from 'react';
import { Badge, Button, Card } from '@butler/ui';
import {
  isAttachmentReady,
  isLogFormComplete,
  ManagementLogForm,
  toLogFields,
  toLogForm,
  validateLogForm,
} from '../components/ManagementLogForm/ManagementLogForm';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useAttachmentUploads } from '../hooks/useAttachmentUploads';
import { useGetManagementLog } from '../hooks/useGetManagementLog';
import { usePatchManagementLog } from '../hooks/usePatchManagementLog';
import { toFieldErrors } from '../utils/apiError';
import { getLogScopeBadge } from '../utils/managementLog';

const EditForm = ({ log, onNavigate, onUnauthorized }) => {
  const update = usePatchManagementLog({ onUnauthorized });
  const uploads = useAttachmentUploads(log.attachments, { onUnauthorized });
  const [form, setForm] = useState(() => toLogForm(log));
  const [serverFieldErrors, setServerFieldErrors] = useState({});
  const scope = getLogScopeBadge(log.scope);
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
    const { data, error } = await update.mutate(log.id, { ...toLogFields(form), attachmentDocumentIds: uploads.documentIds });
    if (data) {
      onNavigate('logDetail', { logId: log.id }, { replace: true });
      return;
    }
    if (error?.status === 400) setServerFieldErrors(toFieldErrors(error));
  };

  return (
    <div className="grid grid-cols-3 items-start gap-6">
      <Card className="col-span-2 space-y-6 p-6">
        <ManagementLogForm
          form={form}
          onChange={updateField}
          fieldError={fieldError}
          uploads={uploads}
          onUnauthorized={onUnauthorized}
          disabled={update.isLoading}
        />
      </Card>
      <Card className="sticky top-6 space-y-4 p-6">
        <h2 className="text-section font-semibold text-ink">수정</h2>
        <p className="text-body font-semibold text-ink">{log.property.displayName}</p>
        <p className="flex items-center gap-2 text-sub text-ink-3">
          공개 범위 <Badge tone={scope.tone}>{scope.label}</Badge>
        </p>
        <p className="text-chip text-ink-3">공개 범위는 바꿀 수 없어요.</p>
        {uploads.isUploading && <p className="text-chip text-ink-3">사진을 올리는 중이에요. 끝나면 저장할 수 있어요.</p>}
        {uploads.hasFailed && <p className="text-chip text-crit-ink">올리지 못한 사진을 빼고 저장해 주세요.</p>}
        {update.error && Object.keys(serverFieldErrors).length === 0 && <NoticeBox>{update.error.message}</NoticeBox>}
        <Button size="lg" className="w-full" onClick={handleSubmit} disabled={!isReady || update.isLoading}>
          {update.isLoading ? '저장 중' : '저장'}
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => window.history.back()} disabled={update.isLoading}>
          취소
        </Button>
      </Card>
    </div>
  );
};

// 관리 로그 수정(S-03). 읽기 전용 기록은 폼을 열지 않는다.
export const ManagementLogEditPage = ({ logId, onNavigate, onUnauthorized }) => {
  const { data: log, error } = useGetManagementLog(logId, { onUnauthorized });

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader title="기록 수정" onBack={() => window.history.back()} />
      {error && <NoticeBox>{error.message}</NoticeBox>}
      {!log && !error && <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>}
      {log?.isReadOnly && <NoticeBox>이 기록은 수정할 수 없어요.</NoticeBox>}
      {log && !log.isReadOnly && <EditForm log={log} onNavigate={onNavigate} onUnauthorized={onUnauthorized} />}
    </div>
  );
};

import { useState } from 'react';
import { Button, Card } from '@butler/ui';
import { ManagementLogBadges } from '../components/ManagementLogBadges/ManagementLogBadges';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useDeleteManagementLog } from '../hooks/useDeleteManagementLog';
import { useGetManagementLog } from '../hooks/useGetManagementLog';
import { formatWon } from '../utils/contract';
import { formatDateKST } from '../utils/format';
import { canDeleteLog } from '../utils/managementLog';

const InfoRow = ({ label, children, numeric = false }) => (
  <div className="flex gap-4 border-b border-line py-3 last:border-b-0">
    <dt className="w-28 shrink-0 text-sub text-ink-3">{label}</dt>
    <dd className={`min-w-0 flex-1 text-body text-ink ${numeric ? 'font-num tabular-nums' : ''}`}>{children}</dd>
  </div>
);

// 삭제: [삭제] → 안내 → [취소]·[삭제] 2단계(빨강 없음).
const DeleteCard = ({ log, onDeleted, onUnauthorized }) => {
  const remove = useDeleteManagementLog({ onUnauthorized });
  const [isConfirming, setIsConfirming] = useState(false);

  const handleDelete = async () => {
    const { data } = await remove.mutate(log.id);
    if (data) onDeleted();
  };

  return (
    <Card className="space-y-3 p-6">
      <h2 className="text-section font-semibold text-ink">기록 삭제</h2>
      {isConfirming ? (
        <>
          <p className="text-sub text-ink-2">이 기록을 삭제할까요? 삭제하면 되돌릴 수 없어요.</p>
          {remove.error && <NoticeBox>{remove.error.message}</NoticeBox>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsConfirming(false)} disabled={remove.isLoading}>
              취소
            </Button>
            <Button onClick={handleDelete} disabled={remove.isLoading}>
              {remove.isLoading ? '삭제 중' : '삭제'}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setIsConfirming(true)}>
          삭제
        </Button>
      )}
    </Card>
  );
};

// 관리 로그 상세(S-03). 수정은 isReadOnly가 아닐 때, 삭제는 내가 쓴 나만 보기만.
export const ManagementLogDetailPage = ({ logId, onNavigate, onUnauthorized }) => {
  const { data: log, error } = useGetManagementLog(logId, { onUnauthorized });

  if (!log) {
    return (
      <div className="w-full max-w-6xl space-y-6 pb-10">
        <PageHeader title="기록 상세" onBack={() => window.history.back()} />
        {error ? <NoticeBox>{error.message}</NoticeBox> : <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader
        title={log.title}
        description={log.property.displayName}
        onBack={() => window.history.back()}
        actions={
          !log.isReadOnly && (
            <Button variant="secondary" onClick={() => onNavigate('logEdit', { logId: log.id })}>
              수정
            </Button>
          )
        }
      />

      <div className="grid grid-cols-3 items-start gap-6">
        <Card className="col-span-2 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-section font-semibold text-ink">기록 정보</h2>
            <ManagementLogBadges log={log} />
          </div>
          <dl className="mt-3">
            <InfoRow label="호실">
              <button
                type="button"
                onClick={() => onNavigate('propertyDetail', { propertyId: log.propertyId })}
                className="text-left font-medium text-ink hover:text-accent-strong"
              >
                {log.property.displayName}
              </button>
            </InfoRow>
            <InfoRow label="날짜" numeric>
              {log.occurredOn}
            </InfoRow>
            <InfoRow label="비용" numeric>
              {formatWon(log.cost) ?? '—'}
            </InfoRow>
            <InfoRow label="내용">
              <span className="whitespace-pre-wrap text-ink-2">{log.content || '—'}</span>
            </InfoRow>
            <InfoRow label="작성일" numeric>
              {formatDateKST(log.createdAt)}
            </InfoRow>
          </dl>
        </Card>

        <div className="space-y-6">
          {log.isReadOnly && (
            <p className="text-sub text-ink-3">
              소유가 끝난 호실의 기록, 다른 소유자의 기록, 자동 기록, 인증이 끊긴 호실 이력은 수정할 수 없어요.
            </p>
          )}
          {canDeleteLog(log) && (
            <DeleteCard log={log} onDeleted={() => onNavigate('logs', {}, { replace: true })} onUnauthorized={onUnauthorized} />
          )}
        </div>
      </div>
    </div>
  );
};

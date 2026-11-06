import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Pagination, SegmentedControl } from '@butler/ui';
import { ReasonDialog } from '../components/ReasonDialog/ReasonDialog';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import { END_REASON_LABEL, VERIFICATION_STATUS_LABEL, VERIFICATION_STATUS_TONE } from '../constants/labels';
import { useGetAdminOwnershipList } from '../hooks/useGetAdminOwnershipList';
import { usePostAdminOwnershipAction } from '../hooks/usePostAdminOwnershipAction';
import { formatDate } from '../utils/formatDate';

const PAGE_SIZE = 20;
const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  ...['UNVERIFIED', 'VERIFIED', 'EXPIRED', 'REVOKED'].map((value) => ({ value, label: VERIFICATION_STATUS_LABEL[value] })),
];

// 철회·종료 대화상자 문구. 운영자 종료는 계약이 있어도 진행된다(api-contract.md 3장).
const ACTION_COPY = {
  revoke: {
    title: '권리자 인증 취소',
    description: '이 소유 관계의 인증 상태를 "인증 취소"로 바꿉니다. 소유 관계는 그대로 유지됩니다.',
    confirmLabel: '인증 취소하기',
    done: '인증을 취소했습니다.',
  },
  end: {
    title: '소유 관계 종료',
    description: '운영자 종료는 진행 중인 계약이 있어도 종료됩니다. 계약은 이전 소유자·임차인에게 읽기 전용으로 남습니다.',
    confirmLabel: '종료하기',
    done: '소유 관계를 종료했습니다.',
  },
};

// 소유 관계 관리. 인증 상태 필터·쪽 번호는 URL 쿼리에 둔다. 활성 소유 관계만 철회·종료할 수 있다.
export const OwnershipListPage = ({ onNavigate, onUnauthorized }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const verificationStatus = searchParams.get('verificationStatus') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  // { action: 'revoke' | 'end', ownership }
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState(null);

  const { data, error, isLoading, refetch } = useGetAdminOwnershipList(
    { verificationStatus: verificationStatus || undefined, page, size: PAGE_SIZE },
    { onUnauthorized },
  );
  const ownershipAction = usePostAdminOwnershipAction({ onUnauthorized });
  const resetAction = ownershipAction.reset;

  const updateParams = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries({ page: undefined, ...changes }).forEach(([key, value]) => {
      if (value) next.set(key, String(value));
      else next.delete(key);
    });
    setSearchParams(next);
  };

  const openAction = (action, ownership) => {
    setNotice(null);
    setPending({ action, ownership });
  };

  const closeAction = useCallback(() => {
    setPending(null);
    resetAction();
  }, [resetAction]);

  const handleSubmit = async (reason) => {
    const { data: updated } = await ownershipAction.mutate(pending.action, pending.ownership.id, { reason });
    if (!updated) return;
    setNotice(`${updated.property.displayName} — ${ACTION_COPY[pending.action].done}`);
    closeAction();
    refetch();
  };

  const totalPages = data ? Math.ceil(data.meta.total / data.meta.size) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-h1 font-bold text-ink">소유 관계 관리</h2>
          <p className="mt-1 text-body text-ink-2">인증 상태로 찾고, 활성 소유 관계의 인증을 취소하거나 종료할 수 있습니다.</p>
        </div>
        {data && <span className="font-num text-body text-ink-3">총 {data.meta.total.toLocaleString('ko-KR')}건</span>}
      </div>

      <Card className="p-5">
        <SegmentedControl
          ariaLabel="권리자 인증 상태"
          options={STATUS_OPTIONS}
          value={verificationStatus}
          onChange={(value) => updateParams({ verificationStatus: value })}
          className="w-[32rem]"
        />
      </Card>

      {notice && (
        <p role="status" className="rounded-btn bg-ok-soft px-4 py-3 text-body text-ok-ink">
          {notice}
        </p>
      )}

      <Card className="overflow-hidden p-0">
        {error && (
          <StatusMessage tone="error" onRetry={refetch}>
            {error.message}
          </StatusMessage>
        )}
        {isLoading && !data && <StatusMessage>불러오는 중입니다</StatusMessage>}
        {data && data.items.length === 0 && <StatusMessage>조건에 맞는 소유 관계가 없습니다.</StatusMessage>}
        {data && data.items.length > 0 && (
          <table className={`w-full text-body ${isLoading ? 'opacity-60' : ''}`}>
            <thead>
              <tr className="border-y border-line text-left text-chip text-ink-3">
                <th className="px-5 py-2 font-medium">호실</th>
                <th className="px-3 py-2 font-medium">소유자</th>
                <th className="px-3 py-2 font-medium">권리자 인증</th>
                <th className="px-3 py-2 font-medium">시작일</th>
                <th className="px-3 py-2 font-medium">종료</th>
                <th className="px-5 py-2 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((ownership) => (
                <tr key={ownership.id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-3 font-medium text-ink">{ownership.property.displayName}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onNavigate('userDetail', { userId: ownership.owner.id })}
                      className="text-left text-ink hover:underline"
                    >
                      {ownership.owner.name}
                      <span className="block text-chip text-ink-3">{ownership.owner.email}</span>
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={VERIFICATION_STATUS_TONE[ownership.verificationStatus]}>
                      {VERIFICATION_STATUS_LABEL[ownership.verificationStatus] ?? ownership.verificationStatus}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 font-num text-chip text-ink-2">{formatDate(ownership.startedAt)}</td>
                  <td className="px-3 py-3 text-chip text-ink-2">
                    {ownership.isActive ? (
                      '활성'
                    ) : (
                      <>
                        <span className="font-num">{formatDate(ownership.endedAt)}</span>
                        <span className="block text-ink-3">{END_REASON_LABEL[ownership.endReason] ?? ownership.endReason}</span>
                      </>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {ownership.isActive && (
                      <div className="flex justify-end gap-2">
                        {ownership.verificationStatus !== 'REVOKED' && (
                          <Button variant="secondary" size="sm" onClick={() => openAction('revoke', ownership)}>
                            인증 취소
                          </Button>
                        )}
                        <Button variant="secondary" size="sm" onClick={() => openAction('end', ownership)}>
                          종료
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Pagination page={page} totalPages={totalPages} onChange={(next) => updateParams({ page: next })} />

      {pending && (
        <ReasonDialog
          title={`${ACTION_COPY[pending.action].title} — ${pending.ownership.property.displayName}`}
          description={ACTION_COPY[pending.action].description}
          confirmLabel={ACTION_COPY[pending.action].confirmLabel}
          error={ownershipAction.error}
          isLoading={ownershipAction.isLoading}
          onSubmit={handleSubmit}
          onClose={closeAction}
        />
      )}
    </div>
  );
};

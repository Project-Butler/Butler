import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card } from '@butler/ui';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import {
  LEDGER_KIND_LABEL,
  VERIFICATION_ATTEMPT_STATUS_LABEL,
  VERIFICATION_ATTEMPT_STATUS_TONE,
  VERIFICATION_REASON_LABEL,
} from '../constants/labels';
import { useGetAdminOwnershipVerificationAttemptList } from '../hooks/useGetAdminOwnershipVerificationAttemptList';
import { formatDateTime } from '../utils/formatDate';

const PAGE_SIZE = 30;
const FILTER_KEYS = ['status', 'reasonCode', 'ownershipId'];

const inputClass =
  'h-11 rounded-input border border-line bg-surface px-3 text-body text-ink outline-none placeholder:text-ink-3 focus:border-accent';

const FilterField = ({ label, children }) => (
  <label className="flex flex-col gap-1">
    <span className="text-chip font-medium text-ink-3">{label}</span>
    {children}
  </label>
);

// 권리자 인증 시도와 실패 사유. 필터는 URL 쿼리에 두고 [적용]을 눌러야 바뀐다. 최근 순 커서 방식이다.
// 사유는 관리자에게만 보인다. 이름·생년월일·대장 내용은 서버가 내려주지 않는다.
export const VerificationAttemptListPage = ({ onNavigate, onUnauthorized }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const applied = Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? '']));
  const [draft, setDraft] = useState(applied);

  const { data, error, isLoading, isLoadingMore, loadMore, refetch } = useGetAdminOwnershipVerificationAttemptList(
    {
      status: applied.status || undefined,
      reasonCode: applied.reasonCode || undefined,
      ownershipId: applied.ownershipId || undefined,
      size: PAGE_SIZE,
    },
    { onUnauthorized },
  );

  const setDraftValue = (key) => (event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }));

  const applyFilters = (values) => {
    const next = new URLSearchParams();
    FILTER_KEYS.forEach((key) => {
      const value = values[key]?.trim();
      if (value) next.set(key, value);
    });
    setSearchParams(next);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    applyFilters(draft);
  };

  const handleReset = () => {
    const empty = Object.fromEntries(FILTER_KEYS.map((key) => [key, '']));
    setDraft(empty);
    applyFilters(empty);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h1 font-bold text-ink">권리자 인증 시도</h2>
        <p className="mt-1 text-body text-ink-2">인증 시도의 결과와 실패 사유입니다. 임대인에게는 사유가 보이지 않습니다.</p>
      </div>

      <Card className="p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <FilterField label="상태">
              <select value={draft.status} onChange={setDraftValue('status')} className={inputClass}>
                <option value="">전체</option>
                {Object.entries(VERIFICATION_ATTEMPT_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="실패 사유">
              <select value={draft.reasonCode} onChange={setDraftValue('reasonCode')} className={inputClass}>
                <option value="">전체</option>
                {Object.entries(VERIFICATION_REASON_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="소유 관계 ID">
              <input value={draft.ownershipId} onChange={setDraftValue('ownershipId')} placeholder="UUID" className={inputClass} />
            </FilterField>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleReset}>
              초기화
            </Button>
            <Button type="submit" variant="primary">
              적용
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        {error && (
          <StatusMessage tone="error" onRetry={refetch}>
            {error.message}
          </StatusMessage>
        )}
        {isLoading && !data && <StatusMessage>불러오는 중입니다</StatusMessage>}
        {data && data.items.length === 0 && <StatusMessage>조건에 맞는 시도가 없습니다.</StatusMessage>}
        {data && data.items.length > 0 && (
          <table className={`w-full text-body ${isLoading ? 'opacity-60' : ''}`}>
            <thead>
              <tr className="border-y border-line text-left text-chip text-ink-3">
                <th className="px-5 py-2 font-medium">요청 시각</th>
                <th className="px-3 py-2 font-medium">호실</th>
                <th className="px-3 py-2 font-medium">요청자</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">사유</th>
                <th className="px-3 py-2 font-medium">대장</th>
                <th className="px-3 py-2 font-medium">읽은 소유자</th>
                <th className="px-5 py-2 font-medium">종료 시각</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((attempt) => (
                <tr key={attempt.id} className="border-b border-line">
                  <td className="px-5 py-3 font-num text-chip tabular-nums text-ink-2">{formatDateTime(attempt.createdAt)}</td>
                  <td className="px-3 py-3 font-medium text-ink">{attempt.displayName}</td>
                  <td className="px-3 py-3 text-chip text-ink-2">
                    {attempt.requester ? (
                      <button
                        type="button"
                        onClick={() => onNavigate('userDetail', { userId: attempt.requester.id })}
                        className="text-left hover:text-accent-strong"
                      >
                        {attempt.requester.name}
                        <span className="block text-ink-3">{attempt.requester.email}</span>
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={VERIFICATION_ATTEMPT_STATUS_TONE[attempt.status] ?? 'default'}>
                      {VERIFICATION_ATTEMPT_STATUS_LABEL[attempt.status] ?? attempt.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-chip text-ink-2">
                    {attempt.reasonCode ? (VERIFICATION_REASON_LABEL[attempt.reasonCode] ?? attempt.reasonCode) : '-'}
                  </td>
                  <td className="px-3 py-3 text-chip text-ink-2">
                    {attempt.ledgerKind ? (LEDGER_KIND_LABEL[attempt.ledgerKind] ?? attempt.ledgerKind) : '-'}
                  </td>
                  <td className="px-3 py-3 font-num text-chip tabular-nums text-ink-2">{attempt.ownerCount ?? '-'}</td>
                  <td className="px-5 py-3 font-num text-chip tabular-nums text-ink-2">{formatDateTime(attempt.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {data?.meta.hasNext && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? '불러오는 중…' : '더 보기'}
          </Button>
        </div>
      )}
    </div>
  );
};

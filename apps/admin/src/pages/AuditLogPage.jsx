import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card } from '@butler/ui';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import { AUDIT_ACTION_LABEL, AUDIT_RESOURCE_TYPE_LABEL } from '../constants/labels';
import { useGetAdminAuditLogList } from '../hooks/useGetAdminAuditLogList';
import { formatDateTime } from '../utils/formatDate';

const PAGE_SIZE = 30;
const FILTER_KEYS = ['action', 'resourceType', 'resourceId', 'actorId', 'from', 'to'];
const DAY_MS = 24 * 60 * 60 * 1000;

// 'YYYY-MM-DD'(KST 달력) → 그날 0시(KST)의 ISO 시각. to는 서버에서 "그 시각 미만"이라 다음 날 0시를 보낸다.
const toKstStartIso = (date, addDays = 0) => {
  if (!date) return undefined;
  const start = new Date(`${date}T00:00:00+09:00`);
  return Number.isNaN(start.getTime()) ? undefined : new Date(start.getTime() + addDays * DAY_MS).toISOString();
};

const shortId = (id) => (id ? `${id.slice(0, 8)}…` : '-');

const inputClass =
  'h-11 rounded-input border border-line bg-surface px-3 text-body text-ink outline-none placeholder:text-ink-3 focus:border-accent';

const FilterField = ({ label, children }) => (
  <label className="flex flex-col gap-1">
    <span className="text-chip font-medium text-ink-3">{label}</span>
    {children}
  </label>
);

const JsonBlock = ({ label, value }) => (
  <div className="min-w-0 flex-1">
    <p className="text-chip font-medium text-ink-3">{label}</p>
    <pre className="mt-1 overflow-x-auto rounded-btn bg-surface-2 p-3 font-num text-chip text-ink-2">
      {value == null ? '-' : JSON.stringify(value, null, 2)}
    </pre>
  </div>
);

// 감사 로그. 필터는 URL 쿼리에 두고 [적용]을 눌러야 바뀐다. 최근 순 커서 방식이라 쪽 번호 대신 "더 보기"로 이어 읽는다.
// 감사 로그는 수정·삭제할 수 없다(api-contract.md 8장).
export const AuditLogPage = ({ onUnauthorized }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const applied = Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? '']));
  const [draft, setDraft] = useState(applied);
  const [expandedId, setExpandedId] = useState(null);

  const { data, error, isLoading, isLoadingMore, loadMore, refetch } = useGetAdminAuditLogList(
    {
      action: applied.action || undefined,
      resourceType: applied.resourceType || undefined,
      resourceId: applied.resourceId || undefined,
      actorId: applied.actorId || undefined,
      from: toKstStartIso(applied.from),
      to: toKstStartIso(applied.to, 1),
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
    setExpandedId(null);
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
        <h2 className="text-h1 font-bold text-ink">감사 로그</h2>
        <p className="mt-1 text-body text-ink-2">누가 언제 무엇을 바꿨는지의 기록입니다. 수정·삭제할 수 없습니다.</p>
      </div>

      <Card className="p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <FilterField label="액션">
              <select value={draft.action} onChange={setDraftValue('action')} className={inputClass}>
                <option value="">전체</option>
                {Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="대상 종류">
              <select value={draft.resourceType} onChange={setDraftValue('resourceType')} className={inputClass}>
                <option value="">전체</option>
                {Object.entries(AUDIT_RESOURCE_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="대상 ID">
              <input value={draft.resourceId} onChange={setDraftValue('resourceId')} placeholder="UUID" className={inputClass} />
            </FilterField>
            <FilterField label="수행자 ID">
              <input value={draft.actorId} onChange={setDraftValue('actorId')} placeholder="UUID" className={inputClass} />
            </FilterField>
            <FilterField label="시작일">
              <input type="date" value={draft.from} onChange={setDraftValue('from')} className={inputClass} />
            </FilterField>
            <FilterField label="종료일">
              <input type="date" value={draft.to} onChange={setDraftValue('to')} className={inputClass} />
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
        {data && data.items.length === 0 && <StatusMessage>조건에 맞는 기록이 없습니다.</StatusMessage>}
        {data && data.items.length > 0 && (
          <table className={`w-full text-body ${isLoading ? 'opacity-60' : ''}`}>
            <thead>
              <tr className="border-y border-line text-left text-chip text-ink-3">
                <th className="px-5 py-2 font-medium">시각</th>
                <th className="px-3 py-2 font-medium">액션</th>
                <th className="px-3 py-2 font-medium">대상</th>
                <th className="px-3 py-2 font-medium">수행자</th>
                <th className="px-5 py-2 font-medium">요약</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((log) => {
                const isExpanded = expandedId === log.id;
                const toggle = () => setExpandedId(isExpanded ? null : log.id);
                return (
                  <Fragment key={log.id}>
                    <tr
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={toggle}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') toggle();
                      }}
                      className="cursor-pointer border-b border-line hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                    >
                      <td className="px-5 py-3 font-num text-chip text-ink-2">{formatDateTime(log.createdAt)}</td>
                      <td className="px-3 py-3 font-medium text-ink">{AUDIT_ACTION_LABEL[log.action] ?? log.action}</td>
                      <td className="px-3 py-3 text-chip text-ink-2">
                        {AUDIT_RESOURCE_TYPE_LABEL[log.resourceType] ?? log.resourceType}
                        <span className="block font-num text-ink-3">{shortId(log.resourceId)}</span>
                      </td>
                      <td className="px-3 py-3 font-num text-chip text-ink-2">{log.actorType === 'SYSTEM' ? '시스템' : shortId(log.actorId)}</td>
                      <td className="px-5 py-3 text-chip text-ink-2">{log.summary ?? '-'}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-line bg-surface">
                        <td colSpan={5} className="space-y-3 px-5 py-4">
                          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-num text-chip text-ink-2">
                            <div>
                              <dt className="inline text-ink-3">대상 ID </dt>
                              <dd className="inline break-all">{log.resourceId ?? '-'}</dd>
                            </div>
                            <div>
                              <dt className="inline text-ink-3">수행자 ID </dt>
                              <dd className="inline break-all">{log.actorId ?? '-'}</dd>
                            </div>
                            <div>
                              <dt className="inline text-ink-3">요청 ID </dt>
                              <dd className="inline break-all">{log.requestId ?? '-'}</dd>
                            </div>
                            <div>
                              <dt className="inline text-ink-3">IP </dt>
                              <dd className="inline">{log.ip ?? '-'}</dd>
                            </div>
                          </dl>
                          <div className="flex gap-4">
                            <JsonBlock label="변경 전" value={log.before} />
                            <JsonBlock label="변경 후" value={log.after} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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

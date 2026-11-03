import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, SegmentedControl } from '@butler/ui';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import { JOB_STATUS_LABEL, JOB_STATUS_TONE, JOB_TYPE_LABEL } from '../constants/labels';
import { useGetAdminJobList } from '../hooks/useGetAdminJobList';
import { usePostAdminJobRetry } from '../hooks/usePostAdminJobRetry';
import { usePostAdminJusoRefresh, usePostAdminKaptRefresh } from '../hooks/usePostAdminReferenceRefresh';
import { formatDateTime } from '../utils/formatDate';

const PAGE_SIZE = 30;
// URL에 status가 없으면 실패 작업부터 보여 준다. 'ALL'이면 전체.
const DEFAULT_STATUS = 'FAILED';
const STATUS_OPTIONS = [
  ...['FAILED', 'PENDING', 'PROCESSING', 'SUCCEEDED'].map((value) => ({ value, label: JOB_STATUS_LABEL[value] })),
  { value: 'ALL', label: '전체' },
];

// 실패 사유. job.error({ code, message })가 없으면 즉시 갱신 작업처럼 result 안에 남긴 error를 찾는다.
const getJobErrorText = (job) => {
  if (job.error) return job.error.message ?? job.error.code ?? JSON.stringify(job.error);
  const nested = Object.values(job.result ?? {}).find((value) => value?.error);
  return nested ? String(nested.error) : null;
};

// 즉시 갱신 결과 한 줄. 서버는 갱신이 실패해도 200으로 결과 요약(result.<대상>.error)을 돌려준다.
const toRefreshSummary = (label, key, data) => {
  const failure = data[key]?.error;
  if (failure) return { tone: 'error', text: `${label} 갱신에 실패했습니다: ${failure}` };
  const seconds = data.totalMs ? ` (${(data.totalMs / 1000).toFixed(1)}초)` : '';
  return { tone: 'ok', text: `${label} 갱신을 마쳤습니다${seconds}.` };
};

const RefreshButton = ({ label, resultKey, refresh, onDone }) => {
  const [summary, setSummary] = useState(null);

  const handleClick = async () => {
    setSummary(null);
    const { data, error } = await refresh.mutate();
    if (data) setSummary(toRefreshSummary(label, resultKey, data));
    if (error) setSummary({ tone: 'error', text: error.message });
    if (data || error) onDone();
  };

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" onClick={handleClick} disabled={refresh.isLoading}>
        {refresh.isLoading ? `${label} 갱신 중…` : `${label} 즉시 갱신`}
      </Button>
      {summary && (
        <p role={summary.tone === 'error' ? 'alert' : 'status'} className={`text-chip ${summary.tone === 'error' ? 'text-crit-ink' : 'text-ok-ink'}`}>
          {summary.text}
        </p>
      )}
    </div>
  );
};

// 작업 관리. 실패 작업을 대기(PENDING)로 되돌리고, juso·K-apt 참고 데이터를 지금 갱신한다.
export const JobListPage = ({ onUnauthorized }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? DEFAULT_STATUS;
  const [retryingId, setRetryingId] = useState(null);
  const [retryError, setRetryError] = useState(null);

  const { data, error, isLoading, isLoadingMore, loadMore, refetch, updateItem } = useGetAdminJobList(
    { status: status === 'ALL' ? undefined : status, size: PAGE_SIZE },
    { onUnauthorized },
  );
  const retry = usePostAdminJobRetry({ onUnauthorized });
  const jusoRefresh = usePostAdminJusoRefresh({ onUnauthorized });
  const kaptRefresh = usePostAdminKaptRefresh({ onUnauthorized });

  const handleStatusChange = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === DEFAULT_STATUS) next.delete('status');
    else next.set('status', value);
    setSearchParams(next);
  };

  const handleRetry = async (job) => {
    setRetryingId(job.id);
    setRetryError(null);
    const { data: retried, error: failure } = await retry.mutate(job.id);
    setRetryingId(null);
    // 목록을 다시 읽지 않고 그 줄만 대기로 바꿔, 실패 목록에서 어떤 작업을 되돌렸는지 보이게 둔다.
    if (retried) updateItem(job.id, { status: retried.status, error: null });
    if (failure) setRetryError(`${JOB_TYPE_LABEL[job.type] ?? job.type}: ${failure.message}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h1 font-bold text-ink">작업 관리</h2>
        <p className="mt-1 text-body text-ink-2">오래 걸리는 작업의 실행 기록입니다. 실패한 작업은 다시 대기 상태로 돌릴 수 있습니다.</p>
      </div>

      <Card className="space-y-3 p-5">
        <div>
          <h3 className="text-body font-semibold text-ink">참고 데이터 즉시 갱신</h3>
          <p className="mt-1 text-chip text-ink-3">정기 갱신(cron)을 기다리지 않고 지금 실행합니다. 몇 분 걸릴 수 있습니다.</p>
        </div>
        <RefreshButton label="juso" resultKey="juso" refresh={jusoRefresh} onDone={refetch} />
        <RefreshButton label="K-apt" resultKey="kapt" refresh={kaptRefresh} onDone={refetch} />
      </Card>

      <Card className="space-y-3 p-5">
        <SegmentedControl ariaLabel="작업 상태" options={STATUS_OPTIONS} value={status} onChange={handleStatusChange} className="w-[28rem]" />
        <p className="text-chip text-ink-3">
          재시도하면 작업이 대기 상태로 바뀌고, 실제 실행은 작업 워커가 도입되면 이어집니다. juso·K-apt 갱신은 위 즉시 갱신 버튼으로 다시
          실행하세요.
        </p>
      </Card>

      {retryError && (
        <p role="alert" className="rounded-btn bg-crit-soft px-4 py-3 text-body text-crit-ink">
          {retryError}
        </p>
      )}

      <Card className="overflow-hidden p-0">
        {error && (
          <StatusMessage tone="error" onRetry={refetch}>
            {error.message}
          </StatusMessage>
        )}
        {isLoading && !data && <StatusMessage>불러오는 중입니다</StatusMessage>}
        {data && data.items.length === 0 && <StatusMessage>조건에 맞는 작업이 없습니다.</StatusMessage>}
        {data && data.items.length > 0 && (
          <table className={`w-full text-body ${isLoading ? 'opacity-60' : ''}`}>
            <thead>
              <tr className="whitespace-nowrap border-y border-line text-left text-chip text-ink-3">
                <th className="px-5 py-2 font-medium">작업</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">시도</th>
                <th className="px-3 py-2 font-medium">실패 사유</th>
                <th className="px-3 py-2 font-medium">만든 시각</th>
                <th className="px-5 py-2 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((job) => (
                <tr key={job.id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-3">
                    <span className="font-medium text-ink">{JOB_TYPE_LABEL[job.type] ?? job.type}</span>
                    <span className="block font-num text-chip text-ink-3">{job.id}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <Badge tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status] ?? job.status}</Badge>
                  </td>
                  <td className="px-3 py-3 font-num text-ink-2">{job.attempts}</td>
                  <td className="max-w-xs px-3 py-3 text-chip text-ink-2">
                    <span className="line-clamp-2 break-all">{getJobErrorText(job) ?? '-'}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-num text-chip text-ink-2">{formatDateTime(job.createdAt)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    {job.status === 'FAILED' && (
                      <Button variant="secondary" size="sm" onClick={() => handleRetry(job)} disabled={retryingId !== null}>
                        {retryingId === job.id ? '재시도 중…' : '재시도'}
                      </Button>
                    )}
                  </td>
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

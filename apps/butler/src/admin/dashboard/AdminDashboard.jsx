import { Badge, Card, StatCard } from '@butler/ui';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import { UserTable } from '../components/UserTable/UserTable';
import { AUDIT_ACTION_LABEL } from '../constants/labels';
import { useGetAdminAuditLogList } from '../hooks/useGetAdminAuditLogList';
import { useGetAdminDashboard } from '../hooks/useGetAdminDashboard';
import { useGetAdminUserList } from '../hooks/useGetAdminUserList';
import { formatDateTime, formatTodayHeading } from '../utils/formatDate';

const RECENT_SIZE = 5;
const formatCount = (value) => value.toLocaleString('ko-KR');

// 처리 대기 항목. 운영자가 손봐야 하는 카운트만 모은다(0건이면 빼고 보여 준다).
const buildPendingItems = (counts) =>
  [
    {
      key: 'unverified',
      tag: '인증 대기',
      tone: 'warning',
      count: counts.ownerships.byVerificationStatus.UNVERIFIED,
      title: '권리자 인증을 받지 않은 소유 관계',
    },
    {
      key: 'failedJobs',
      tag: '작업 실패',
      tone: 'danger',
      count: counts.jobs.byStatus.FAILED,
      title: '실패한 작업 — 원인 확인 후 재시도 필요',
    },
    {
      key: 'openTickets',
      tag: '요청 접수',
      tone: 'warning',
      count: counts.tickets.byStatus.OPEN,
      title: '접수 후 처리되지 않은 수리·점검 요청',
    },
  ].filter((item) => item.count > 0);

export const AdminDashboard = ({ onNavigate, onUnauthorized, currentUser }) => {
  const dashboard = useGetAdminDashboard({ onUnauthorized });
  const auditLogs = useGetAdminAuditLogList({ size: RECENT_SIZE }, { onUnauthorized });
  const recentUsers = useGetAdminUserList({ size: RECENT_SIZE }, { onUnauthorized });

  const counts = dashboard.data;
  const pendingItems = counts ? buildPendingItems(counts) : [];
  const pendingTotal = pendingItems.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-body text-ink-3">{formatTodayHeading()}</p>
        <h2 className="mt-1 text-h1 font-bold text-ink">안녕하세요, {currentUser?.name ?? '관리자'}님</h2>
        {counts && (
          <p className="mt-1 text-body text-ink-2">
            {pendingTotal > 0 ? `처리 대기 항목이 ${formatCount(pendingTotal)}건 있습니다.` : '처리 대기 항목이 없습니다.'}
          </p>
        )}
      </div>

      {dashboard.error ? (
        <Card className="p-5">
          <StatusMessage tone="error" onRetry={dashboard.refetch}>
            {dashboard.error.message}
          </StatusMessage>
        </Card>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="전체 회원"
            value={counts ? formatCount(counts.users.total) : '-'}
            unit="명"
            hint={counts && `임대인 ${formatCount(counts.users.byRole.LANDLORD)} · 임차인 ${formatCount(counts.users.byRole.TENANT)}`}
          />
          <StatCard
            label="활성 소유 관계"
            value={counts ? formatCount(counts.ownerships.active) : '-'}
            unit="건"
            hint={counts && `인증 완료 ${formatCount(counts.ownerships.byVerificationStatus.VERIFIED)}`}
          />
          <StatCard
            label="진행 중 계약"
            value={counts ? formatCount(counts.contracts.active) : '-'}
            unit="건"
            hint={counts && `전체 ${formatCount(counts.contracts.total)}건`}
          />
          <StatCard
            label="처리 대기"
            value={counts ? formatCount(pendingTotal) : '-'}
            unit="건"
            hint={pendingItems.map((item) => `${item.tag} ${formatCount(item.count)}`).join(' · ') || undefined}
            hintTone={pendingTotal > 0 ? 'crit' : 'neutral'}
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-body font-semibold text-ink">처리 대기</h3>
            <span className="text-chip text-ink-3">{pendingItems.length}종</span>
          </div>
          {counts && pendingItems.length === 0 && <StatusMessage>처리할 항목이 없습니다.</StatusMessage>}
          {dashboard.isLoading && !counts && <StatusMessage>불러오는 중입니다</StatusMessage>}
          <div className="mt-4 space-y-3">
            {pendingItems.map((item) => (
              <div key={item.key} className="rounded-btn border border-line p-3">
                <Badge tone={item.tone}>{item.tag}</Badge>
                <p className="mt-1.5 text-body font-semibold text-ink">
                  {item.title} <span className="font-num">{formatCount(item.count)}</span>건
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-body font-semibold text-ink">최근 활동 로그</h3>
          {auditLogs.error && (
            <StatusMessage tone="error" onRetry={auditLogs.refetch}>
              {auditLogs.error.message}
            </StatusMessage>
          )}
          {auditLogs.isLoading && !auditLogs.data && <StatusMessage>불러오는 중입니다</StatusMessage>}
          {auditLogs.data?.items.length === 0 && <StatusMessage>아직 기록이 없습니다.</StatusMessage>}
          <div className="mt-4 space-y-4">
            {auditLogs.data?.items.map((log) => (
              <div key={log.id} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-seal" />
                <div className="min-w-0">
                  <p className="font-num text-chip text-ink-3">{formatDateTime(log.createdAt)}</p>
                  <p className="text-body text-ink-2">
                    {AUDIT_ACTION_LABEL[log.action] ?? log.action}
                    {log.summary && <span className="text-ink-3"> · {log.summary}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between p-5 pb-0">
          <h3 className="text-body font-semibold text-ink">최근 가입 회원</h3>
          <button type="button" onClick={() => onNavigate('users')} className="text-chip font-medium text-accent hover:underline">
            전체 보기
          </button>
        </div>
        {recentUsers.error && (
          <StatusMessage tone="error" onRetry={recentUsers.refetch}>
            {recentUsers.error.message}
          </StatusMessage>
        )}
        {recentUsers.isLoading && !recentUsers.data && <StatusMessage>불러오는 중입니다</StatusMessage>}
        {recentUsers.data && (
          <div className="mt-4">
            <UserTable users={recentUsers.data.items} onSelect={(user) => onNavigate('userDetail', { userId: user.id })} />
          </div>
        )}
      </Card>
    </div>
  );
};

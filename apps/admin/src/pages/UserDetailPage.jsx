import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card } from '@butler/ui';
import { ChevronLeft } from 'lucide-react';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import {
  END_REASON_LABEL,
  ROLE_LABEL,
  USER_STATUS_LABEL,
  USER_STATUS_TONE,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_STATUS_TONE,
} from '../constants/labels';
import { useGetAdminUser } from '../hooks/useGetAdminUser';
import { usePatchAdminUserStatus } from '../hooks/usePatchAdminUserStatus';
import { formatDate, formatDateTime } from '../utils/formatDate';

const MAX_REASON_LENGTH = 500;

// 서버(USER_STATUS_CHANGE_NOT_ALLOWED)와 같은 조건. 버튼을 미리 막고 이유를 보여 준다.
const getLockedReason = (user, currentUser) => {
  if (user.id === currentUser?.id) return '자기 자신의 상태는 바꿀 수 없습니다.';
  if (user.role === 'ADMIN') return '운영자 계정의 상태는 바꿀 수 없습니다.';
  if (user.status === 'WITHDRAWN') return '탈퇴한 계정의 상태는 바꿀 수 없습니다.';
  return null;
};

const InfoRow = ({ label, children }) => (
  <div className="flex gap-4 py-2">
    <dt className="w-24 shrink-0 text-chip font-medium text-ink-3">{label}</dt>
    <dd className="min-w-0 text-body text-ink">{children}</dd>
  </div>
);

// 정지(사유 필수)·해제. 버튼을 누르면 바로 보내지 않고 한 번 더 확인한다.
const StatusPanel = ({ user, currentUser, onChanged, onUnauthorized }) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(null);
  const { error, isLoading, updateStatus, reset } = usePatchAdminUserStatus({ onUnauthorized });

  const lockedReason = getLockedReason(user, currentUser);
  const isSuspended = user.status === 'SUSPENDED';

  const close = () => {
    setIsConfirming(false);
    setReason('');
    setReasonError(null);
    reset();
  };

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (!isSuspended && !trimmed) {
      setReasonError('정지 사유를 입력해 주세요.');
      return;
    }
    const { data } = await updateStatus(user.id, isSuspended ? { status: 'ACTIVE' } : { status: 'SUSPENDED', reason: trimmed });
    if (data) {
      onChanged(data);
      close();
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-body font-semibold text-ink">계정 상태</h3>
        <Badge tone={USER_STATUS_TONE[user.status]}>{USER_STATUS_LABEL[user.status] ?? user.status}</Badge>
      </div>

      {isSuspended && (
        <dl>
          <InfoRow label="정지 일시">{formatDateTime(user.suspendedAt)}</InfoRow>
          <InfoRow label="정지 사유">{user.suspendReason ?? '-'}</InfoRow>
        </dl>
      )}

      {lockedReason && <p className="text-chip text-ink-3">{lockedReason}</p>}

      {!lockedReason && !isConfirming && (
        <Button variant="secondary" onClick={() => setIsConfirming(true)}>
          {isSuspended ? '정지 해제' : '회원 정지'}
        </Button>
      )}

      {!lockedReason && isConfirming && (
        <div className="space-y-3 rounded-btn border border-line p-4">
          {isSuspended ? (
            <p className="text-body text-ink-2">정지를 해제하면 이 회원이 다시 로그인할 수 있습니다.</p>
          ) : (
            <>
              <p className="text-body text-ink-2">정지하면 이 회원의 모든 로그인 세션이 끊기고, 해제할 때까지 로그인할 수 없습니다.</p>
              <label className="flex flex-col gap-1.5">
                <span className="text-label font-semibold text-ink">정지 사유</span>
                <textarea
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setReasonError(null);
                  }}
                  maxLength={MAX_REASON_LENGTH}
                  rows={3}
                  aria-invalid={reasonError ? true : undefined}
                  className={`resize-none rounded-input border bg-surface px-3.5 py-2.5 text-body text-ink outline-none placeholder:text-ink-3 ${
                    reasonError ? 'border-crit' : 'border-line focus:border-accent'
                  }`}
                  placeholder="회원에게 안내할 수 있는 문장으로 적어 주세요."
                />
                <span className={`text-chip ${reasonError ? 'text-crit-ink' : 'text-ink-3'}`}>
                  {reasonError ?? `${reason.length}/${MAX_REASON_LENGTH}`}
                </span>
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="text-chip text-crit-ink">
              {error.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="primary" onClick={handleSubmit} disabled={isLoading}>
              {isSuspended ? '해제하기' : '정지하기'}
            </Button>
            <Button variant="secondary" onClick={close} disabled={isLoading}>
              취소
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export const UserDetailPage = ({ onNavigate, onUnauthorized, currentUser }) => {
  const { userId } = useParams();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const { data: user, error, isLoading, refetch, setData } = useGetAdminUser(userId, { onUnauthorized });

  // 목록에서 왔으면 뒤로 가서 검색 조건을 살리고, 주소로 바로 들어왔으면 목록으로 보낸다.
  const goBack = () => (location.key === 'default' ? onNavigate('users') : routerNavigate(-1));

  return (
    <div className="space-y-4">
      <button type="button" onClick={goBack} className="flex items-center gap-1 text-body text-ink-2 hover:text-ink">
        <ChevronLeft size={18} aria-hidden="true" />
        회원 목록
      </button>

      {error && (
        <Card className="p-5">
          <StatusMessage tone="error" onRetry={error.code === 'USER_NOT_FOUND' ? undefined : refetch}>
            {error.message}
          </StatusMessage>
        </Card>
      )}
      {isLoading && !user && <StatusMessage>불러오는 중입니다</StatusMessage>}

      {user && (
        <>
          <div>
            <h2 className="text-h1 font-bold text-ink">{user.name}</h2>
            <p className="mt-1 text-body text-ink-2">{user.email}</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card className="col-span-2 p-5">
              <h3 className="text-body font-semibold text-ink">기본 정보</h3>
              <dl className="mt-2 divide-y divide-line">
                <InfoRow label="역할">{ROLE_LABEL[user.role] ?? user.role}</InfoRow>
                <InfoRow label="연락처">{user.phone ?? '-'}</InfoRow>
                <InfoRow label="가입일">{formatDate(user.createdAt)}</InfoRow>
                {user.withdrawnAt && <InfoRow label="탈퇴일">{formatDate(user.withdrawnAt)}</InfoRow>}
              </dl>
            </Card>
            <StatusPanel user={user} currentUser={currentUser} onChanged={setData} onUnauthorized={onUnauthorized} />
          </div>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between p-5 pb-0">
              <h3 className="text-body font-semibold text-ink">소유 관계</h3>
              <span className="text-chip text-ink-3">{user.ownerships.length}건</span>
            </div>
            {user.ownerships.length === 0 ? (
              <StatusMessage>등록된 소유 관계가 없습니다.</StatusMessage>
            ) : (
              <table className="mt-4 w-full text-body">
                <thead>
                  <tr className="border-y border-line text-left text-chip text-ink-3">
                    <th className="px-5 py-2 font-medium">호실</th>
                    <th className="px-3 py-2 font-medium">권리자 인증</th>
                    <th className="px-3 py-2 font-medium">시작일</th>
                    <th className="px-5 py-2 font-medium">종료</th>
                  </tr>
                </thead>
                <tbody>
                  {user.ownerships.map((ownership) => (
                    <tr key={ownership.id} className="border-b border-line last:border-b-0">
                      <td className="px-5 py-3 font-medium text-ink">{ownership.displayName}</td>
                      <td className="px-3 py-3">
                        <Badge tone={VERIFICATION_STATUS_TONE[ownership.verificationStatus]}>
                          {VERIFICATION_STATUS_LABEL[ownership.verificationStatus] ?? ownership.verificationStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 font-num text-chip text-ink-2">{formatDate(ownership.startedAt)}</td>
                      <td className="px-5 py-3 text-chip text-ink-2">
                        {ownership.isActive ? (
                          <Badge tone="success">활성</Badge>
                        ) : (
                          <span>
                            <span className="font-num">{formatDate(ownership.endedAt)}</span>
                            {ownership.endReason && ` · ${END_REASON_LABEL[ownership.endReason] ?? ownership.endReason}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

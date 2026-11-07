import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button } from '@butler/ui';
import { useGetContractList } from '../../web/hooks/useGetContractList';
import { useGetPropertyList } from '../../web/hooks/useGetPropertyList';
import { useGetPropertyOwnershipList } from '../../web/hooks/useGetPropertyOwnershipList';
import { buildLocation } from '../../web/routes';
import { formatDday, formatManwon, getDdayTone, getTodayKST } from '../../web/utils/contract';
import { formatNumber } from '../../web/utils/format';
import fileIcon from '../assets/icon-file.svg';
import { toHomeSummary } from '../utils/home';

// 웹 대시보드와 같은 크기로 받는다(목록 API 최대 100건). 넘으면 앞 100건으로 센다(서버 집계는 후속).
const LIST_SIZE = 100;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const EMPTY = '—';

const getWeekday = (dateString) => WEEKDAYS[new Date(`${dateString}T00:00:00Z`).getUTCDay()];
const orEmpty = (value) => (value == null ? EMPTY : value);

const CARD_CLASS = 'rounded-card border border-line bg-surface';

const StatTile = ({ label, value, badge, error }) => (
  <section aria-label={label} className={`${CARD_CLASS} flex min-w-0 flex-1 flex-col items-start gap-1.5 p-4`}>
    <p className="text-m-sub text-ink-2">{label}</p>
    <p className="font-num text-num-lg font-bold tabular-nums text-ink">{value}</p>
    {error ? <p className="text-m-sub text-crit-ink">{error}</p> : badge && <Badge mobile tone={badge.tone}>{badge.label}</Badge>}
  </section>
);

// 권리자 인증 칸 칩: 미인증이 있으면 몇 건인지, 모두 인증이면 완료, 부동산이 없으면 없음.
const getVerificationBadge = (verification) => {
  if (!verification) return null;
  if (verification.total === 0) return { tone: 'default', label: '부동산 없음' };
  return verification.unverified > 0 ? { tone: 'pending', label: `미인증 ${verification.unverified}` } : { tone: 'verified', label: '모두 인증' };
};

const TaskItem = ({ task }) => {
  const { kind, contract } = task;
  const isRent = kind === 'rent';
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-surface-2">
        <img src={fileIcon} alt="" width={18} height={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-medium text-ink">
          {contract.property.displayName} {isRent ? '월세 입금일' : '계약 종료'}
        </span>
        <span className="font-num text-num-sub font-medium tabular-nums text-ink-2">
          {isRent ? `오늘 · ${formatManwon(contract.monthlyRent)}` : `갱신·퇴거 준비 · ${contract.endDate}`}
        </span>
      </span>
      {isRent ? (
        <Badge mobile tone="warning">오늘</Badge>
      ) : (
        <Badge tone={getDdayTone(contract.daysUntilEnd)} className="rounded-chip font-num tabular-nums">
          {formatDday(contract.daysUntilEnd)}
        </Badge>
      )}
    </li>
  );
};

// 임대인 앱 홈 (Figma M03 / 임대인 홈, 3:111). 웹 대시보드(LandlordDashboard)와 같은 API·같은 조건으로 불러와 Figma 칸에 맞게 보여 준다.
// Figma 에 있지만 연결할 API 가 없는 것(상단 검색·알림, 수리 요청 항목, 오늘 할 일 [전체 보기])은 두지 않는다.
// 부동산을 등록하고 오면 history state 의 notice 를 한 번 보여 주고 state 를 바로 비운다(새로고침·뒤로 가기에 다시 안 보임).
export const HomePage = ({ user, onUnauthorized }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [notice] = useState(() => location.state?.notice ?? null);
  useEffect(() => {
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const hookOptions = { onUnauthorized };
  const contracts = useGetContractList(
    { status: 'UPCOMING,ACTIVE,EXPIRING_SOON', sort: 'endDate:asc', size: LIST_SIZE, activeOwnership: 'true' },
    hookOptions,
  );
  const properties = useGetPropertyList({ relation: 'OWNER', size: LIST_SIZE }, hookOptions);
  const ownerships = useGetPropertyOwnershipList({ active: 'true', size: LIST_SIZE }, hookOptions);

  const today = getTodayKST();
  const summary = toHomeSummary({ contracts: contracts.data, properties: properties.data, ownerships: ownerships.data, today });
  const { verification } = summary;

  const goTo = (key, params) => navigate(buildLocation(key, params));

  return (
    <div className="flex flex-col gap-3.5">
      {notice && (
        <p role="status" className="rounded-input bg-accent-soft px-4 py-3 text-body font-medium text-accent-strong">
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <p className="font-num text-num-sub font-medium tabular-nums text-ink-3">
          {today} ({getWeekday(today)})
        </p>
        <p className="text-body font-medium text-ink-2">안녕하세요, {user.name}님</p>
        <h1 className="text-page-sm font-bold text-ink">오늘 확인할 일 {summary.taskCount == null ? EMPTY : `${summary.taskCount}건`}</h1>
      </div>

      <div className="flex gap-2.5">
        <Button
          variant="verifyOutline"
          size="h44"
          className="flex-1"
          disabled={!verification?.firstUnverifiedPropertyId}
          onClick={() => goTo('propertyVerify', { propertyId: verification.firstUnverifiedPropertyId })}
        >
          권리자 인증
        </Button>
        <Button size="h44" className="flex-1" onClick={() => goTo('propertyRegister')}>
          + 부동산 등록
        </Button>
      </div>

      <section aria-label="총 보증금" className={`${CARD_CLASS} flex flex-col gap-1.5 p-4`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-m-sub text-ink-2">총 보증금</p>
          <Badge mobile>부동산 {orEmpty(summary.propertyTotal)}</Badge>
        </div>
        <p className="font-num text-num-kpi font-bold tabular-nums text-ink">
          {summary.depositSum == null ? EMPTY : `${formatNumber(summary.depositSum)}원`}
        </p>
        {contracts.error || properties.error ? (
          <p className="text-m-sub text-crit-ink">{contracts.error?.message ?? properties.error.message}</p>
        ) : (
          <p className="text-m-sub text-ink-2">
            계약 중 {orEmpty(summary.contractCount)} · 공실 {orEmpty(summary.vacantCount)}
          </p>
        )}
      </section>

      <div className="flex gap-2.5">
        <StatTile label="계약 중" value={orEmpty(summary.contractCount)} badge={summary.contractBadge} error={contracts.error?.message} />
        <StatTile
          label="권리자 인증"
          value={verification ? `${verification.verified} / ${verification.total}` : EMPTY}
          badge={getVerificationBadge(verification)}
          error={ownerships.error?.message}
        />
      </div>

      <section aria-label="오늘 할 일" className={`${CARD_CLASS} flex flex-col px-4 py-2`}>
        <h2 className="py-1 text-m-card font-semibold text-ink">오늘 할 일</h2>
        {contracts.error && <p className="py-3 text-body text-crit-ink">{contracts.error.message}</p>}
        {contracts.data && summary.tasks.length === 0 && <p className="py-4 text-center text-body text-ink-3">오늘 할 일이 없어요</p>}
        {summary.tasks.length > 0 && (
          <ul>
            {summary.tasks.map((task) => (
              <TaskItem key={`${task.kind}-${task.contract.id}`} task={task} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

import { Badge, Button, Card, StatCard } from '@butler/ui';
import { useBuildingNames } from '../hooks/useBuildingNames';
import { useGetContractList } from '../hooks/useGetContractList';
import { useGetLandlordSetup } from '../hooks/useGetLandlordSetup';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { useGetPropertyOwnershipList } from '../hooks/useGetPropertyOwnershipList';
import { addDays, daysBetween, formatDday, formatPeriod, formatWon, getDdayTone, getTodayKST } from '../utils/contract';
import { formatNumber, formatUnitSpec } from '../utils/format';
import { getUnitTypeLabel } from '../utils/unitListing';
import { getVerificationBadge } from '../utils/verificationBadge';

// 표에 보여 줄 부동산 수(나머지는 [전체 보기] → 내 부동산)
const TABLE_SIZE = 5;
// 권리자 인증 KPI는 활성 소유 관계를 한 번에 최대 100건 받아 센다. 100건을 넘으면 인증 수가 적게 보인다(서버 집계는 후속).
const OWNERSHIP_COUNT_SIZE = 100;
// 계약 카드는 목록 API 최대 크기(100건)로 받아 화면에서 합산한다(D-11). 넘으면 '100건 이상'으로 알린다.
const CONTRACT_SUM_SIZE = 100;
// 예정 일정에 보여 줄 기간(D-12)
const SCHEDULE_DAYS = 30;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const getWeekday = (dateString) => WEEKDAYS[new Date(`${dateString}T00:00:00Z`).getUTCDay()];

const LOGS = [
  { date: '10.12', title: '임대차 계약 등록 · 특약 2건', unit: '노원 1234호' },
  { date: '10.08', title: '권리자 인증 완료 · 등기부 대조', unit: '노원 1234호' },
  { date: '10.01', title: '욕실 누수 수리 완료 · 사진 4장', unit: '노원 1234호' },
];

// 최근 관리 로그(LOGS)만 관리 로그 기능(5번) 전까지 화면 예시 값을 그대로 둔다. 나머지는 실데이터.

// 예정 일정(D-12): 오늘~30일 안의 계약 시작일·종료일. 시작일은 시작 전 계약만.
const toScheduleEvents = (contracts, today) => {
  const last = addDays(today, SCHEDULE_DAYS);
  const inRange = (date) => date >= today && date <= last;
  return contracts
    .flatMap((contract) => [
      contract.status === 'UPCOMING' && inRange(contract.startDate)
        ? { key: `${contract.id}-start`, date: contract.startDate, title: '계약 시작', contract }
        : null,
      inRange(contract.endDate) ? { key: `${contract.id}-end`, date: contract.endDate, title: '계약 종료', contract } : null,
    ])
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
};

const countVerified = (ownershipList) =>
  ownershipList.items.filter((ownership) => ownership.verificationStatus === 'VERIFIED').length;

const getVerificationHint = ({ verified, total, error }) => {
  if (error) return { hint: error.message, tone: 'crit' };
  if (total == null) return { hint: '불러오는 중', tone: 'neutral' };
  if (total === 0) return { hint: '등록한 부동산 없음', tone: 'neutral' };
  const unverified = total - verified;
  return unverified > 0 ? { hint: `인증 필요 ${unverified}건`, tone: 'crit' } : { hint: '모두 인증 완료', tone: 'ok' };
};

// 초기 세팅 안내: 진행률 + 등록한 건물·호실 수
const SetupCard = ({ setup, onNavigate }) => {
  const { data, error } = setup;
  if (error) return <Card className="p-5 text-body text-crit-ink">{error.message}</Card>;
  if (!data) return null;

  const buildingCount = data.buildings.length;
  const propertyCount = data.buildings.reduce((sum, building) => sum + building.propertyCount, 0);
  const message =
    buildingCount === 0
      ? '첫 건물을 등록하고 호실을 추가해 보세요'
      : propertyCount === 0
        ? '건물에 첫 호실을 추가해 보세요'
        : `건물 ${buildingCount}개 · 호실 ${propertyCount}개를 등록했어요`;

  return (
    <Card className="flex items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="text-chip font-medium text-ink-3">
          초기 세팅 <span className="font-num tabular-nums">{data.progress}%</span>
        </p>
        <p className="mt-1 text-card font-semibold text-ink">{message}</p>
      </div>
      <Button className="shrink-0" onClick={() => onNavigate(buildingCount === 0 ? 'buildingRegister' : 'setup')}>
        {buildingCount === 0 ? '건물 등록' : '초기 세팅 보기'}
      </Button>
    </Card>
  );
};

export const LandlordDashboard = ({ onNavigate, onUnauthorized }) => {
  const setup = useGetLandlordSetup({ onUnauthorized });
  const propertyList = useGetPropertyList({ relation: 'OWNER', size: TABLE_SIZE }, { onUnauthorized });
  const properties = propertyList.data?.items ?? [];
  const { getPropertyName } = useBuildingNames({ onUnauthorized });
  const propertyTotal = propertyList.data?.meta.total ?? null;
  const ownershipList = useGetPropertyOwnershipList({ active: 'true', size: OWNERSHIP_COUNT_SIZE }, { onUnauthorized });
  const verification = {
    error: ownershipList.error,
    verified: ownershipList.data ? countVerified(ownershipList.data) : null,
    total: ownershipList.data?.meta.total ?? null,
  };
  const verificationHint = getVerificationHint(verification);

  const today = getTodayKST();
  // 시작 전·진행 중 계약을 한 번에 받는다. 예정 일정은 전부, 나머지(총 보증금 D-16·계약 중·오늘 할 일·
  // 내 부동산 표)는 진행 중(ACTIVE·EXPIRING_SOON)만 쓴다.
  const liveContracts = useGetContractList(
    { status: 'UPCOMING,ACTIVE,EXPIRING_SOON', sort: 'endDate:asc', size: CONTRACT_SUM_SIZE },
    { onUnauthorized },
  );
  const liveItems = liveContracts.data?.items ?? [];
  const contracts = liveItems.filter((contract) => contract.status !== 'UPCOMING');
  const contractTotal = liveContracts.data ? contracts.length : null;
  const isContractCapped = (liveContracts.data?.meta.total ?? 0) > CONTRACT_SUM_SIZE;
  const depositSum = contracts.reduce((sum, contract) => sum + contract.deposit, 0);
  // 종료일 오름차순으로 받았으므로 그대로 쓴다.
  const expiringContracts = contracts.filter((contract) => contract.status === 'EXPIRING_SOON');
  const contractByPropertyId = new Map(contracts.map((contract) => [contract.property.id, contract]));
  const schedules = toScheduleEvents(liveItems, today);
  const depositHint = liveContracts.error
    ? liveContracts.error.message
    : contractTotal == null
      ? '불러오는 중'
      : isContractCapped
        ? `100건 이상 · 앞 ${CONTRACT_SUM_SIZE}건 합계`
        : `계약 ${contractTotal}건 합계`;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-num text-body tabular-nums text-ink-3">
          {today} ({getWeekday(today)})
        </p>
        <h2 className="mt-1 text-h1 font-bold text-ink">안녕하세요, 버틀러님</h2>
        <p className="mt-1 text-body text-ink-2">
          {expiringContracts.length > 0
            ? `오늘 확인할 일이 ${expiringContracts.length}건 있습니다. 종료가 가까운 계약을 확인해 주세요.`
            : '오늘 확인할 일이 없습니다.'}
        </p>
      </div>

      <SetupCard setup={setup} onNavigate={onNavigate} />

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="총 보증금"
          value={contractTotal != null ? formatNumber(depositSum) : '—'}
          unit="원"
          hint={depositHint}
          hintTone={liveContracts.error ? 'crit' : isContractCapped ? 'warn' : 'neutral'}
        />
        <StatCard
          label="보유 부동산"
          value={propertyTotal ?? '—'}
          unit="건"
          hint={
            propertyList.error
              ? propertyList.error.message
              : setup.data
                ? `건물 ${setup.data.buildings.length}개`
                : propertyTotal != null
                  ? `호실 ${propertyTotal}`
                  : '불러오는 중'
          }
          hintTone={propertyList.error ? 'crit' : 'neutral'}
        />
        <StatCard
          label="계약 중"
          value={contractTotal ?? '—'}
          unit="건"
          hint={contractTotal != null ? `종료 임박 ${expiringContracts.length}건` : undefined}
          hintTone={expiringContracts.length > 0 ? 'warn' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-body font-semibold text-ink">오늘 할 일</h3>
            <span className="font-num text-chip tabular-nums text-ink-3">{expiringContracts.length}건</span>
          </div>
          <div className="mt-4 space-y-3">
            {liveContracts.error && <p className="text-body text-crit-ink">{liveContracts.error.message}</p>}
            {liveContracts.data && expiringContracts.length === 0 && (
              <p className="py-4 text-center text-body text-ink-3">종료가 가까운 계약이 없습니다</p>
            )}
            {expiringContracts.map((contract) => (
              <div key={contract.id} className="flex items-start justify-between gap-4 rounded-btn border border-line p-3">
                <div className="min-w-0">
                  <Badge tone={getDdayTone(contract.daysUntilEnd)} className="font-num tabular-nums">
                    {formatDday(contract.daysUntilEnd)}
                  </Badge>
                  <p className="mt-1.5 text-body font-semibold text-ink">계약 종료 예정 — 갱신하거나 퇴거를 준비하세요</p>
                  <p className="mt-0.5 text-chip text-ink-3">
                    {getPropertyName(contract.property)} · <span className="font-num tabular-nums">{contract.endDate}</span> 종료
                    · 보증금 <span className="font-num tabular-nums">{formatWon(contract.deposit)}</span>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  onClick={() => onNavigate('contractDetail', { contractId: contract.id })}
                >
                  계약 보기
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-body font-semibold text-ink">예정 일정</h3>
            <span className="text-chip text-ink-3">30일 이내</span>
          </div>
          <div className="mt-4 space-y-3">
            {liveContracts.error && <p className="text-body text-crit-ink">{liveContracts.error.message}</p>}
            {liveContracts.data && schedules.length === 0 && (
              <p className="py-4 text-center text-body text-ink-3">30일 안의 일정이 없습니다</p>
            )}
            {schedules.map((event) => {
              const days = daysBetween(today, event.date);
              return (
                <button
                  key={event.key}
                  type="button"
                  onClick={() => onNavigate('contractDetail', { contractId: event.contract.id })}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <div className="w-10 shrink-0 text-center">
                    <p className="font-num text-body font-bold tabular-nums text-ink">{event.date.slice(5)}</p>
                    <p className="text-eyebrow text-ink-3">{getWeekday(event.date)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-ink">{event.title}</p>
                    <p className="truncate text-chip text-ink-3">{getPropertyName(event.contract.property)}</p>
                  </div>
                  <Badge tone={getDdayTone(days)} className="font-num tabular-nums">
                    {formatDday(days)}
                  </Badge>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 overflow-hidden p-0">
          <div className="flex items-center justify-between p-5 pb-0">
            <h3 className="text-body font-semibold text-ink">내 부동산</h3>
            <div className="flex items-center gap-3">
              <span className="font-num text-chip tabular-nums text-ink-3">{propertyTotal ?? 0}건</span>
              <Button variant="secondary" size="sm" onClick={() => onNavigate('buildingList')}>
                전체 보기
              </Button>
            </div>
          </div>
          <table className="mt-4 w-full text-body">
            <thead>
              <tr className="border-y border-line text-left text-chip text-ink-3">
                <th className="px-5 py-2 font-medium">부동산</th>
                <th className="px-3 py-2 font-medium">임차인</th>
                <th className="px-3 py-2 font-medium">계약 기간</th>
                <th className="px-5 py-2 font-medium">권리자 인증</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => {
                const badge = getVerificationBadge(property.myRelation?.verificationStatus);
                const spec = [getUnitTypeLabel(property.myListing?.unitType), formatUnitSpec(property)].filter(Boolean).join(' · ');
                const contract = contractByPropertyId.get(property.id);
                return (
                  <tr key={property.id} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => onNavigate('propertyDetail', { propertyId: property.id })}
                        className="text-left font-medium text-ink hover:text-accent-strong"
                      >
                        {getPropertyName(property)}
                      </button>
                      {spec && <p className="font-num text-chip tabular-nums text-ink-3">{spec}</p>}
                    </td>
                    {/* 진행 중 계약이 있는 호실만 임차인·기간을 보여 준다 */}
                    <td className="px-3 py-3 text-ink-2">{contract?.tenantName ?? '—'}</td>
                    <td className="px-3 py-3 font-num tabular-nums text-ink-2">{contract ? formatPeriod(contract) : '—'}</td>
                    <td className="px-5 py-3">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                  </tr>
                );
              })}
              {properties.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-ink-3">
                    {propertyList.error?.message ?? (propertyList.isLoading ? '불러오는 중입니다' : '등록한 부동산이 없습니다')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <h3 className="text-body font-semibold text-ink">최근 관리 로그</h3>
          <div className="mt-4 space-y-4">
            {LOGS.map((log) => (
              <div key={log.title} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0">
                  <p className="font-num text-chip text-ink-3">
                    {log.date} · {log.unit}
                  </p>
                  <p className="text-body text-ink-2">{log.title}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="권리자 인증"
          value={verification.verified ?? '—'}
          unit={verification.total != null ? `/ ${verification.total}` : undefined}
          hint={verificationHint.hint}
          hintTone={verificationHint.tone}
        />
      </div>
    </div>
  );
};

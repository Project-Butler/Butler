import { Badge, Button, Card, StatCard } from '@butler/ui';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { useGetPropertyOwnershipList } from '../hooks/useGetPropertyOwnershipList';
import { formatUnitSpec } from '../utils/format';
import { getVerificationBadge } from '../utils/verificationBadge';

// 표에 보여 줄 부동산 수(나머지는 [전체 보기] → 내 부동산)
const TABLE_SIZE = 5;
// 권리자 인증 KPI는 활성 소유 관계를 한 번에 최대 100건 받아 센다. 100건을 넘으면 인증 수가 적게 보인다(서버 집계는 후속).
const OWNERSHIP_COUNT_SIZE = 100;

const TODOS = [
  {
    id: 1,
    dday: 'D-7',
    title: '계약 종료 예정 — 퇴거 점검 일정 잡기',
    desc: '노원 그린아파트 1234호 · 2026-10-20 종료 · 보증금 50,000,000원 반환 예정',
    actionLabel: '일정 잡기',
  },
  {
    id: 2,
    dday: '확인 필요',
    ddayTone: 'warn',
    title: '권리자 인증 필요 — 등기부등본 업로드',
    desc: '강남 햇살빌라 345호 · 인증하면 커뮤니티 글쓰기·분쟁 상담이 열립니다',
    actionLabel: '인증하기',
    verify: true,
  },
];

const SCHEDULES = [
  { date: '10.17', day: '토', title: '퇴거 점검', desc: '노원 그린아파트 1234호', dday: 'D-4' },
  { date: '10.20', day: '화', title: '계약 종료', desc: '노원 그린아파트 1234호', dday: 'D-7' },
  { date: '10.26', day: '월', title: '월세 납부일', desc: '강남 햇살빌라 345호', dday: 'D-13' },
];

const LOGS = [
  { date: '10.12', title: '임대차 계약 등록 · 특약 2건', unit: '노원 1234호' },
  { date: '10.08', title: '권리자 인증 완료 · 등기부 대조', unit: '노원 1234호' },
  { date: '10.01', title: '욕실 누수 수리 완료 · 사진 4장', unit: '노원 1234호' },
];

// 보유 부동산·권리자 인증 KPI와 내 부동산 표(부동산명·인증)는 실데이터.
// 총 보증금·계약 중·할 일·일정·로그는 계약 관리(#4) 전까지 화면 예시 값을 그대로 둔다.
const countVerified = (ownershipList) =>
  ownershipList.items.filter((ownership) => ownership.verificationStatus === 'VERIFIED').length;

const getVerificationHint = ({ verified, total, error }) => {
  if (error) return { hint: error.message, tone: 'crit' };
  if (total == null) return { hint: '불러오는 중', tone: 'neutral' };
  if (total === 0) return { hint: '등록한 부동산 없음', tone: 'neutral' };
  const unverified = total - verified;
  return unverified > 0 ? { hint: `인증 필요 ${unverified}건`, tone: 'crit' } : { hint: '모두 인증 완료', tone: 'ok' };
};

export const LandlordDashboard = ({ onNavigate, onUnauthorized }) => {
  const propertyList = useGetPropertyList({ relation: 'OWNER', size: TABLE_SIZE }, { onUnauthorized });
  const properties = propertyList.data?.items ?? [];
  const propertyTotal = propertyList.data?.meta.total ?? null;
  const ownershipList = useGetPropertyOwnershipList({ active: 'true', size: OWNERSHIP_COUNT_SIZE }, { onUnauthorized });
  const verification = {
    error: ownershipList.error,
    verified: ownershipList.data ? countVerified(ownershipList.data) : null,
    total: ownershipList.data?.meta.total ?? null,
  };
  const verificationHint = getVerificationHint(verification);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-body text-ink-3">2026-10-19 (월)</p>
        <h2 className="mt-1 text-h1 font-bold text-ink">안녕하세요, 버틀러님</h2>
        <p className="mt-1 text-body text-ink-2">오늘 확인할 일이 2건 있습니다. 노원 그린아파트 계약 종료가 7일 남았습니다.</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="총 보증금" value="80,000,000" unit="원" hint="계약 2건 합계" />
        <StatCard
          label="보유 부동산"
          value={propertyTotal ?? '—'}
          unit="건"
          hint={propertyList.error ? propertyList.error.message : propertyTotal != null ? `아파트 ${propertyTotal}` : '불러오는 중'}
          hintTone={propertyList.error ? 'crit' : 'neutral'}
        />
        <StatCard label="계약 중" value="2" unit="건" hint="종료 임박 1건" hintTone="warn" />
        <StatCard
          label="권리자 인증"
          value={verification.verified ?? '—'}
          unit={verification.total != null ? `/ ${verification.total}` : undefined}
          hint={verificationHint.hint}
          hintTone={verificationHint.tone}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-body font-semibold text-ink">오늘 할 일</h3>
            <span className="text-chip text-ink-3">{TODOS.length}건</span>
          </div>
          <div className="mt-4 space-y-3">
            {TODOS.map((todo) => (
              <div key={todo.id} className="flex items-start justify-between gap-4 rounded-btn border border-line p-3">
                <div className="min-w-0">
                  <Badge tone={todo.ddayTone === 'warn' ? 'warning' : 'default'} className="font-num tabular-nums">{todo.dday}</Badge>
                  <p className="mt-1.5 text-body font-semibold text-ink">{todo.title}</p>
                  <p className="mt-0.5 text-chip text-ink-3">{todo.desc}</p>
                </div>
                <Button variant={todo.verify ? 'verifyOutline' : 'secondary'} size="sm" className="shrink-0 whitespace-nowrap">
                  {todo.actionLabel}
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
            {SCHEDULES.map((s) => (
              <div key={s.title + s.date} className="flex items-start gap-3">
                <div className="w-10 shrink-0 text-center">
                  <p className="font-num text-body font-bold text-ink">{s.date}</p>
                  <p className="text-eyebrow text-ink-3">{s.day}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-ink">{s.title}</p>
                  <p className="truncate text-chip text-ink-3">{s.desc}</p>
                </div>
                <Badge>{s.dday}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 overflow-hidden p-0">
          <div className="flex items-center justify-between p-5 pb-0">
            <h3 className="text-body font-semibold text-ink">내 부동산</h3>
            <div className="flex items-center gap-3">
              <span className="font-num text-chip tabular-nums text-ink-3">{propertyTotal ?? 0}건</span>
              <Button variant="secondary" size="sm" onClick={() => onNavigate('properties')}>
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
                const spec = formatUnitSpec(property);
                return (
                  <tr key={property.id} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => onNavigate('propertyDetail', { propertyId: property.id })}
                        className="text-left font-medium text-ink hover:text-accent-strong"
                      >
                        {property.displayName}
                      </button>
                      <p className="text-chip text-ink-3">
                        아파트{spec && <span className="font-num tabular-nums"> · {spec}</span>}
                      </p>
                    </td>
                    {/* TODO(#4 계약 관리): 임차인·계약 기간은 계약 데이터가 생기면 채운다 */}
                    <td className="px-3 py-3 text-ink-3">—</td>
                    <td className="px-3 py-3 text-ink-3">—</td>
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
    </div>
  );
};

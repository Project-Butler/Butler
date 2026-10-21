import { CheckCircle2, Circle, Lock } from 'lucide-react';
import { Badge, Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetActivityList } from '../hooks/useGetActivityList';
import { useGetLandlordSetup } from '../hooks/useGetLandlordSetup';
import { formatActivity } from '../utils/activity';
import { formatDateKST } from '../utils/format';

const ACTIVITY_SIZE = 10;

// STEP 키(GET /dashboard/landlord/setup steps[].key) → 화면 문구와 이동할 곳
const STEP_INFO = {
  BUILDING: { title: '건물 등록', desc: '도로명주소로 건물을 등록해요', action: { label: '건물 등록', view: 'buildingRegister' } },
  PROPERTY: { title: '호실 등록', desc: '건물에 호실을 추가해요', action: { label: '호실 등록', view: 'propertyRegister' } },
  CONTRACT: { title: '계약 등록', desc: '임대차 계약을 등록해요' },
  TENANT_INVITE: { title: '임차인 초대', desc: '임차인을 버틀러로 초대해요' },
  OPERATION_CHECK: { title: '운영 점검', desc: '앞 단계를 마치면 열려요' },
};

const StepCard = ({ index, step, onNavigate }) => {
  const info = STEP_INFO[step.key] ?? { title: step.key, desc: '' };
  const isUnavailable = step.available === false;
  const isLocked = Boolean(step.locked);
  const Icon = step.done ? CheckCircle2 : isLocked ? Lock : Circle;

  return (
    <Card className="flex items-center justify-between gap-4 p-5">
      <div className="flex min-w-0 items-center gap-3">
        <Icon size={22} className={step.done ? 'shrink-0 text-ok' : 'shrink-0 text-ink-3'} aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-num text-eyebrow text-ink-3">STEP {index + 1}</p>
          <p className="text-card font-semibold text-ink">
            {info.title}
            {step.count > 0 && <span className="ml-1 font-num tabular-nums text-ink-2">({step.count})</span>}
          </p>
          <p className="text-sub text-ink-2">{info.desc}</p>
        </div>
      </div>
      <div className="shrink-0">
        {step.done && <Badge tone="success">완료</Badge>}
        {!step.done && (isUnavailable || isLocked) && <Badge>{isLocked ? '잠김' : '준비 중'}</Badge>}
        {!step.done && !isUnavailable && !isLocked && info.action && (
          <Button size="sm" onClick={() => onNavigate(info.action.view)}>
            {info.action.label}
          </Button>
        )}
      </div>
    </Card>
  );
};

// 초기 세팅(Landly /setup): 진행률, STEP 카드, 건물별 등록 호실, 최근 활동 10개.
// params.notice: 호실 저장 직후 안내(이미 등록된 면적·층을 썼을 때 등).
export const SetupPage = ({ params, onNavigate, onUnauthorized }) => {
  const setup = useGetLandlordSetup({ onUnauthorized });
  const activities = useGetActivityList({ size: ACTIVITY_SIZE }, { onUnauthorized });
  const data = setup.data;

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader
        title="초기 세팅"
        description="건물과 호실을 등록하고, 계약·임차인 초대까지 마치면 운영을 시작할 수 있어요."
      />
      {params.notice && <NoticeBox tone="info">{params.notice}</NoticeBox>}
      {setup.error && <NoticeBox>{setup.error.message}</NoticeBox>}

      <Card className="space-y-3 p-6">
        <div className="flex items-end justify-between">
          <p className="text-body font-semibold text-ink">진행률</p>
          <p className="font-num text-kpi font-bold tabular-nums text-ink">
            {data ? data.progress : '—'}
            <span className="ml-0.5 text-body font-medium text-ink-2">%</span>
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={data?.progress ?? 0}
          className="h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${data?.progress ?? 0}%` }} />
        </div>
      </Card>

      {data && (
        <div className="grid grid-cols-2 gap-4">
          {data.steps.map((step, index) => (
            <StepCard key={step.key} index={index} step={step} onNavigate={onNavigate} />
          ))}
        </div>
      )}
      {setup.isLoading && !data && (
        <p role="status" className="py-6 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      )}

      <div className="grid grid-cols-2 gap-6">
        <Card className="space-y-3 p-6">
          <h2 className="text-section font-semibold text-ink">건물별 등록 호실</h2>
          {data?.buildings.length === 0 && <p className="text-body text-ink-3">등록한 건물이 없습니다</p>}
          <ul className="divide-y divide-line">
            {data?.buildings.map((building) => (
              <li key={building.id}>
                <button
                  type="button"
                  onClick={() => onNavigate('buildingDetail', { landlordBuildingId: building.id })}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-accent-strong"
                >
                  <span className="min-w-0 truncate text-body font-medium text-ink">{building.name}</span>
                  <span className="shrink-0 font-num text-sub tabular-nums text-ink-2">{building.propertyCount}개</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3 p-6">
          <h2 className="text-section font-semibold text-ink">최근 활동</h2>
          {activities.error && <NoticeBox>{activities.error.message}</NoticeBox>}
          {activities.data?.length === 0 && <p className="text-body text-ink-3">아직 활동이 없습니다</p>}
          <ul className="space-y-3">
            {activities.data?.map((activity) => (
              <li key={activity.id} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0">
                  <p className="font-num text-chip text-ink-3">{formatDateKST(activity.createdAt)}</p>
                  <p className="text-body text-ink-2">{formatActivity(activity)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

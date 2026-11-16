import { Badge, Button } from '@butler/ui';
import {
  BedDouble,
  Building2,
  CalendarClock,
  CalendarPlus,
  Check,
  KeyRound,
  Layers,
  MapPin,
  Ruler,
  Search,
  ShieldAlert,
  StickyNote,
  User,
  Wallet,
  Wrench,
} from 'lucide-react';
import { IconTile } from '../IconTile/IconTile';
import { daysBetween, formatContractAmount, formatDday } from '../../utils/contract';
import { formatFloor } from '../../utils/floor';
import { getPropertyStatusBadge, getUnitTypeLabel } from '../../utils/unitListing';
import { getVerificationBadge } from '../../utils/verificationBadge';

const EVENT_ICON = { CONTRACT_START: CalendarPlus, RENT: Wallet, CONTRACT_END: CalendarClock, VERIFICATION_EXPIRY: ShieldAlert };
const LOG_ICON = { REPAIR: Wrench, INSPECTION: Search, NOTE: StickyNote, TICKET_SUMMARY: Check };
const SOON_DAYS = 90;

// 카드 바닥의 "해야 할 행동" 버튼(utils/unitCard getNeededAction 결과 → 문구·이동)
const ACTIONS = {
  VERIFY: { label: '권리자 인증하기', variant: 'verifyOutline', key: 'propertyVerify' },
  RENEW: { label: '인증 다시 하기', variant: 'verifyOutline', key: 'propertyVerify' },
  INQUIRY: { label: '문의하기', variant: 'secondary', key: 'supportInquiry' },
  CONTRACT: { label: '계약 등록', variant: 'primary', key: 'contractRegister' },
  RENT_DAY: { label: '입금일 입력', variant: 'secondary', key: 'propertyDetail' },
};

// 값이 있는 것만 보여 준다. 하나도 없으면 줄을 그리지 않는다(선택 항목을 안 넣는 임대인이 많다).
const SpecRow = ({ property }) => {
  const items = [
    [BedDouble, getUnitTypeLabel(property.myListing?.unitType)],
    [Ruler, property.exclusiveArea != null ? `${property.exclusiveArea}㎡` : null],
    [Layers, formatFloor(property.floor)],
  ].filter(([, value]) => value);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 text-sub text-ink-2">
      {items.map(([Icon, value]) => (
        <span key={value} className="inline-flex items-center gap-1.5 font-num tabular-nums">
          <Icon size={15} className="text-ink-3" aria-hidden="true" />
          {value}
        </span>
      ))}
    </div>
  );
};

const NextEventLine = ({ event, today }) => {
  if (!event) return <p className="text-sub text-ink-3">다가오는 일정이 없어요</p>;
  const Icon = event.kind === 'LOG' ? (LOG_ICON[event.logType] ?? StickyNote) : EVENT_ICON[event.kind];
  const days = daysBetween(today, event.date);
  const isSoon = event.kind === 'CONTRACT_END' && days < SOON_DAYS;
  const [, month, day] = event.date.split('-');
  return (
    <div className="flex items-center gap-2 text-sub">
      <Icon size={15} className={isSoon ? 'text-warn-ink' : 'text-ink-3'} aria-hidden="true" />
      <span className="shrink-0 text-ink-3">다음 일정</span>
      <span className="min-w-0 truncate font-medium text-ink">
        {Number(month)}월 {Number(day)}일 {event.label}
      </span>
      <span className={`ml-auto shrink-0 font-num font-semibold tabular-nums ${isSoon ? 'text-warn-ink' : 'text-ink-2'}`}>
        {formatDday(days)}
      </span>
    </div>
  );
};

// 내 부동산 호실 카드: 누르면 호실 상세(한 곳). 바닥 칸 높이는 늘 같다(행동 버튼 1개 또는 "확인할 일 없음 · 최근 기록").
export const UnitCard = ({ property, contract, ownership, nextEvent, action, latestLog, today, onNavigate }) => {
  const status = getPropertyStatusBadge(property.status);
  const verification = getVerificationBadge(ownership?.verificationStatus ?? property.myRelation?.verificationStatus);
  const actionDef = action ? ACTIONS[action] : null;
  const openDetail = () => onNavigate('propertyDetail', { propertyId: property.id });
  const runAction = (event) => {
    event.stopPropagation();
    if (actionDef.key === 'contractRegister') onNavigate('contractRegister', { propertyId: property.id });
    else if (actionDef.key === 'supportInquiry') onNavigate('supportInquiry');
    else onNavigate(actionDef.key, { propertyId: property.id });
  };

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`${property.displayName} 호실 상세`}
      onClick={openDetail}
      onKeyDown={(event) => event.key === 'Enter' && event.target === event.currentTarget && openDetail()}
      className="flex cursor-pointer flex-col rounded-card border border-line bg-surface transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <IconTile icon={Building2} tone={contract ? 'accent' : 'mute'} size="lg" />
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={verification.tone}>{verification.label}</Badge>
        </div>
      </div>
      <div className="px-5 pb-3 pt-3">
        <h3 className="truncate text-card font-semibold text-ink">{property.displayName}</h3>
        {property.complex.roadAddress && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-sub text-ink-3">
            <MapPin size={13} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{property.complex.roadAddress}</span>
          </p>
        )}
      </div>
      <SpecRow property={property} />
      <div className="mx-5 mt-3 rounded-input bg-surface-2 px-4 py-3">
        {contract ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-chip text-ink-3">임차인</p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-body font-medium text-ink">
                <User size={14} className="text-ink-3" aria-hidden="true" />
                {contract.tenantName}
              </p>
            </div>
            <div>
              <p className="text-chip text-ink-3">{contract.leaseType === 'JEONSE' ? '전세' : '보증금 / 월세'}</p>
              <p className="mt-0.5 font-num text-body font-semibold text-ink tabular-nums">{formatContractAmount(contract).replace(/^전세 /, '')}</p>
            </div>
          </div>
        ) : (
          <p className="inline-flex items-center gap-2 text-body text-ink-2">
            <KeyRound size={16} className="text-ink-3" aria-hidden="true" />
            비어 있는 호실이에요
          </p>
        )}
      </div>
      <div className="px-5 pb-5 pt-3">
        <NextEventLine event={nextEvent} today={today} />
      </div>
      <div className="mt-auto flex h-16 items-center border-t border-line px-3">
        {actionDef ? (
          <Button variant={actionDef.variant} size="h44" className="w-full" onClick={runAction}>
            {actionDef.label}
          </Button>
        ) : (
          <div className="flex w-full items-center gap-3 px-2 text-sub">
            <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-ok-ink">
              <Check size={15} aria-hidden="true" />
              확인할 일 없음
            </span>
            <span className="min-w-0 flex-1 truncate text-right text-ink-3">
              {latestLog ? `최근 기록 · ${latestLog.occurredOn.slice(5).replace('-', '.')} ${latestLog.title}` : '아직 기록이 없어요'}
            </span>
          </div>
        )}
      </div>
    </article>
  );
};

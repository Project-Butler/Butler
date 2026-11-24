// 하우스 로그 계약 타임라인·앞으로 할 일·전체 호실 계산(순수 함수, #203 P-4b).
// 근거: docs/15 수정 계획 H-22~H-47, 2단계 타임라인 변경 계획 2장 P-4b. 날짜는 모두 'YYYY-MM-DD'(KST) 문자열.
// 계약·통지는 계약 쪽 데이터를 읽어서 보여 주기만 한다(H-23). 저장하거나 바꾸지 않는다.
import { addDays, addYears, daysBetween, formatDday } from './contract';
import { formatDateKST } from './format';
import { ROOM_FILTER_NONE } from './room';

// 지난 계약은 지금 계약 시작부터 최대 4년 앞까지, 이전 소유 띠는 내 소유 시작부터 최대 2년 앞까지(7장 가정).
export const PAST_CONTRACT_MAX_YEARS = 4;
export const PREVIOUS_OWNER_BAND_MAX_YEARS = 2;
// 계약이 없을 때 축은 최근 2년(H-39 시안).
export const EMPTY_AXIS_YEARS = 2;
// 다음 계약은 지금 계약 끝에서 이만큼만 보여 준다(축이 너무 길어지지 않게).
export const NEXT_CONTRACT_TAIL_MONTHS = 6;
// 갱신 거절 통지 구간(만료 6~2개월 전). 서버 platform/renewalNotice.js와 같은 계산.
export const NOTICE_WINDOW_START_MONTHS = 6;
export const NOTICE_DEADLINE_MONTHS = 2;

const IN_PROGRESS = ['ACTIVE', 'EXPIRING_SOON'];

const toUtc = (dateString) => Date.UTC(Number(dateString.slice(0, 4)), Number(dateString.slice(5, 7)) - 1, Number(dateString.slice(8, 10)));
const pad = (value) => String(value).padStart(2, '0');
const minDate = (...dates) => dates.filter(Boolean).reduce((a, b) => (b < a ? b : a));
const maxDate = (...dates) => dates.filter(Boolean).reduce((a, b) => (b > a ? b : a));

// 달 더하기. 그 날이 없는 달은 말일(2027-08-31 - 6개월 = 2027-02-28).
export const addMonths = (dateString, months) => {
  const year = Number(dateString.slice(0, 4));
  const month = Number(dateString.slice(5, 7)) - 1 + months;
  const day = Number(dateString.slice(8, 10));
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`;
};

// ISO 시각(createdAt·verifiedAt) → KST 날짜. 이미 날짜면 그대로.
export const toDateOnly = (value) => {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : formatDateKST(value);
};

// 통지 구간: 시작(만료 6개월 전)·마감(2개월 전)·권장 마감(마감 하루 전).
export const computeNoticeWindow = (endDate) => {
  const deadline = addMonths(endDate, -NOTICE_DEADLINE_MONTHS);
  return { windowStart: addMonths(endDate, -NOTICE_WINDOW_START_MONTHS), deadline, safeDeadline: addDays(deadline, -1) };
};

// 축 위 위치(0~100%). 축 밖은 양 끝으로 붙인다.
export const toPercent = (date, axis) => {
  const span = toUtc(axis.end) - toUtc(axis.start);
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((toUtc(date) - toUtc(axis.start)) / span) * 100));
};

export const isInAxis = (date, axis) => Boolean(date) && date >= axis.start && date <= axis.end;

// 계약이 실제로 끝나는 날(해지일이 있으면 해지일).
export const getContractEnd = (contract) => contract.terminatedOn ?? contract.endDate;

// 한 소유 관계의 계약을 지금·다음·지난 계약으로 나눈다.
// - current: 진행 중 계약. 없으면 시작 전 계약 중 가장 이른 것(등록만 한 호실).
// - next: 지금 계약 뒤에 시작하는 시작 전 계약. previousContractId가 지금 계약이면 RENEWAL(갱신), 아니면 NEW_TENANT(새 임차인, H-27).
// - past: 끝난(만료·해지) 계약, 시작일 순(H-34).
// ownershipEnded(매도 등)면 진행 중·시작 전이어도 모두 지난 계약으로 본다(읽기 전용, 소유가 끝난 날까지).
export const classifyContracts = (contracts = [], { ownershipEndedOn = null, today = null } = {}) => {
  const sorted = [...contracts].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  if (ownershipEndedOn) {
    const past = sorted
      .filter((contract) => contract.startDate <= ownershipEndedOn)
      .map((contract) => (getContractEnd(contract) > ownershipEndedOn ? { ...contract, cutOn: ownershipEndedOn } : contract));
    return { current: null, next: null, nextKind: null, past, lapsed: null };
  }
  const upcoming = sorted.filter((contract) => contract.status === 'UPCOMING');
  // 중도 해지: 해지일이 오늘 이후면 그날까지는 지금 계약으로 본다(임차인이 아직 산다, C6). 끝나는 날 = 해지일.
  const endingEarly = today
    ? sorted.find((contract) => contract.status === 'TERMINATED' && contract.terminatedOn && contract.startDate <= today && contract.terminatedOn >= today)
    : null;
  const current =
    sorted.find((contract) => IN_PROGRESS.includes(contract.status)) ??
    (endingEarly ? { ...endingEarly, endDate: endingEarly.terminatedOn, originalEndDate: endingEarly.endDate, isEndingEarly: true } : null) ??
    upcoming[0] ??
    null;
  const next = current ? (upcoming.find((contract) => contract.id !== current.id && contract.startDate > current.endDate) ?? null) : null;
  const nextKind = next ? (next.previousContractId === current.id ? 'RENEWAL' : 'NEW_TENANT') : null;
  const past = sorted.filter((contract) => (contract.status === 'EXPIRED' || contract.status === 'TERMINATED') && contract.id !== current?.id);
  // lapsed: 지금·시작 전 계약이 없고 가장 최근 계약이 해지 없이 만료된 경우(C5 묵시적 갱신 안내용).
  const latestPast = past[past.length - 1];
  const lapsed = !current && latestPast && latestPast.status === 'EXPIRED' && !latestPast.terminatedOn ? latestPast : null;
  return { current, next, nextKind, past, lapsed };
};

// 지난 계약 막대의 끝: 해지일 · 만료일 · (소유가 끝나 잘린 날) 중 이른 날.
export const getPastBarEnd = (contract) => minDate(getContractEnd(contract), contract.cutOn);

// 이전 소유 띠(H-30). inheritedLogs: 내 소유 시작 전의 호실 이력 중 isFromPreviousOwner인 것.
// 띠는 가장 오래된 넘겨받은 기록부터 최대 2년. 넘는 기록은 olderCount("그 전 기록 n건").
export const computeOwnerBand = ({ myStart, inheritedLogs = [] }) => {
  if (!myStart) return null;
  const logs = inheritedLogs.filter((log) => log.isFromPreviousOwner && log.occurredOn < myStart);
  if (logs.length === 0) return null;
  const oldest = minDate(...logs.map((log) => log.occurredOn));
  const start = maxDate(oldest, addYears(myStart, -PREVIOUS_OWNER_BAND_MAX_YEARS));
  return {
    start,
    end: myStart,
    count: logs.length,
    olderCount: logs.filter((log) => log.occurredOn < start).length,
  };
};

// 한 호실 축 범위.
// - 지금 계약이 있으면 그 계약 기간(다음 계약이 있으면 끝에서 최대 6개월 더).
// - 없으면 최근 2년(소유가 끝났으면 끝난 날까지 2년).
// - 지난 계약은 축 시작을 앞으로 늘린다(지금 계약 시작에서 최대 4년). 넘는 계약 수는 hiddenPastCount.
// - 이전 소유 띠가 있으면 띠 시작까지.
export const computeAxis = ({ current, next, past = [], band = null, today, ownershipEndedOn = null }) => {
  let start;
  let end;
  if (current) {
    start = current.startDate;
    end = next ? minDate(next.endDate, addMonths(current.endDate, NEXT_CONTRACT_TAIL_MONTHS)) : current.endDate;
  } else {
    end = ownershipEndedOn ?? today;
    start = addYears(end, -EMPTY_AXIS_YEARS);
  }
  const pastLimit = addYears(current?.startDate ?? end, -PAST_CONTRACT_MAX_YEARS);
  const pastInRange = past.filter((contract) => getPastBarEnd(contract) >= pastLimit);
  if (pastInRange.length > 0) start = minDate(start, maxDate(pastInRange[0].startDate, pastLimit));
  if (band) start = minDate(start, band.start);
  return { start, end, hiddenPastCount: past.length - pastInRange.length };
};

// 거르기(유형·방)에 맞는 기록. 방 'NONE'은 방이 없는 기록(H-22: 거르기는 기록 점만 줄인다).
export const matchesLogFilter = (log, { types = [], rooms = [] } = {}) =>
  (types.length === 0 || types.includes(log.type)) && (rooms.length === 0 || rooms.includes(log.room ?? ROOM_FILTER_NONE));

// 기록 점. 날짜가 축 밖이면 뺀다.
export const toRecordDots = (logs, axis, filter) =>
  logs
    .filter((log) => isInAxis(log.occurredOn, axis) && matchesLogFilter(log, filter))
    .map((log) => ({ key: `log-${log.id}`, date: log.occurredOn, kind: 'LOG', logType: log.type, log }));

const NOTICE_TITLE = { REFUSE_RENEWAL: '갱신 거절 통지 기록', CHANGE_TERMS: '조건 변경 통지 기록' };

// 계약 점(파랑, H-25): 계약 시작·통지 기록·갱신 계약 등록·해지. 거르기와 상관없이 늘 보인다.
export const toContractDots = ({ current, next, nextKind, past = [], notices = [] }, axis) => {
  const dots = [];
  const push = (key, date, title, description, contract, extra = {}) => {
    if (isInAxis(date, axis)) dots.push({ key, date, kind: 'CONTRACT', title, description, contractId: contract.id, ...extra });
  };
  const tenant = (contract) => (contract.tenantName ? `임차인 ${contract.tenantName}` : null);
  past.forEach((contract) => {
    push(`start-${contract.id}`, contract.startDate, '지난 계약 시작', `${contract.startDate} ~ ${getContractEnd(contract)}${tenant(contract) ? ` · ${tenant(contract)}` : ''}`, contract, { isPast: true });
    if (contract.terminatedOn) push(`end-${contract.id}`, contract.terminatedOn, '계약 해지', tenant(contract), contract, { isPast: true });
  });
  if (current) {
    push(`start-${current.id}`, current.startDate, '계약 시작', `${current.startDate} ~ ${current.endDate}${tenant(current) ? ` · ${tenant(current)}` : ''}`, current);
    if (current.terminatedOn) push(`end-${current.id}`, current.terminatedOn, '계약 해지', tenant(current), current);
  }
  // 통지 점은 지금 계약에 붙는다. 지금 계약이 없으면(만료 뒤 등) 그리지 않는다.
  if (current) notices.forEach((notice) => {
    const date = notice.deliveredOn ?? notice.sentOn;
    push(`notice-${notice.id}`, date, NOTICE_TITLE[notice.kind] ?? '통지 기록', notice.deliveredOn ? `도달 ${notice.deliveredOn}` : `보낸 날 ${notice.sentOn} · 도달일 없음`, current);
  });
  if (next) {
    const isRenewal = nextKind === 'RENEWAL';
    const registeredOn = toDateOnly(next.createdAt);
    if (registeredOn) push(`registered-${next.id}`, registeredOn, isRenewal ? '갱신 계약 등록' : '새 임차인 계약 등록', `${next.startDate}부터 · 시작 전`, next);
    push(
      `start-${next.id}`,
      next.startDate,
      `${isRenewal ? '갱신 계약 시작' : '새 임차인 계약 시작'} · ${next.endDate}까지`,
      `${tenant(next) ?? ''}${tenant(next) ? ' · ' : ''}시작 전`,
      next,
    );
  }
  return dots;
};

// 같은 날 점은 하나로 묶는다(H-26). 날짜 순.
export const groupDotsByDate = (dots) => {
  const groups = new Map();
  dots.forEach((dot) => {
    if (!groups.has(dot.date)) groups.set(dot.date, []);
    groups.get(dot.date).push(dot);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, items]) => ({ key: `g-${date}`, date, items }));
};

// id로 합친다(오프셋 페이지를 읽는 사이 추가·삭제로 겹친 줄, 두 조회의 겹친 줄). 처음 본 것을 남긴다.
export const mergeLogsById = (...lists) => {
  const seen = new Set();
  return lists.flat().filter((log) => {
    if (seen.has(log.id)) return false;
    seen.add(log.id);
    return true;
  });
};

// 통지 단계 칩(타임라인 머리).
export const getTimelineStatus = ({ current, nextKind, renewalNotice }) => {
  if (!current) return { tone: 'default', label: '계약 없음' };
  if (nextKind === 'RENEWAL') return { tone: 'success', label: '갱신 확정' };
  if (nextKind === 'NEW_TENANT') return { tone: 'verified', label: '다음 임차인 입주 예정' };
  if (!renewalNotice) return null;
  if (renewalNotice.hasDeliveredInTime) return { tone: 'success', label: '통지 도달 기록 있음' };
  if (renewalNotice.phase === 'OPEN' || renewalNotice.phase === 'CLOSING_SOON') return { tone: 'warning', label: '갱신 거절 통지 기간' };
  if (renewalNotice.phase === 'CLOSED') return { tone: 'danger', label: '통지 마감 지남' };
  return null;
};

// 계약 기간 중 지난 비율(0~100, 정수).
export const getElapsedPercent = (contract, today) => {
  const total = daysBetween(contract.startDate, contract.endDate);
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((daysBetween(contract.startDate, today) / total) * 100)));
};

// 계약 기간(년). 2년 계약 = 2.
export const getContractYears = (contract) => Math.max(1, Math.round(daysBetween(contract.startDate, addDays(contract.endDate, 1)) / 365));

// 앞으로 할 일(U-16, H-27·H-38·H-42). 지금 계약과 그 계약 응답의 renewalNotice로만 계산한다.
// 항목: { id, tone(crit·warn·ok·mute·later), icon, title, description, dday?, action?: { kind, label, contractId } }
// - action.kind: 'NOTICE'(통지 기록하기 → 호실 상세 계약 칸), 'CONTRACT'(계약 보기), 'RENEW'(갱신 계약 등록)
// - 퇴거 점검·입주 인수인계는 누를 곳 없는 알림 문구만(H-42).
// 만료 뒤 묵시적 갱신 안내를 보여 주는 기간(만료 뒤 2년 = 갱신된 기간).
const LAPSED_NOTICE_DAYS = 730;

export const buildTodoItems = ({ current, next, nextKind, today, lapsed = null, lapsedNotices = [] }) => {
  // 계약이 해지 없이 만료됐는데 통지 기간 안에 도달한 통지 기록이 없으면, 같은 조건 2년 갱신으로 본다(H-27·C5).
  if (!current && lapsed) {
    const window = computeNoticeWindow(lapsed.endDate);
    const deliveredInTime = lapsedNotices.some((item) => item.deliveredOn && item.deliveredOn >= window.windowStart && item.deliveredOn <= window.deadline);
    const daysSince = daysBetween(lapsed.endDate, today);
    if (deliveredInTime || daysSince <= 0 || daysSince > LAPSED_NOTICE_DAYS) return [];
    return [
      {
        id: 'implicit-renewal-lapsed',
        tone: 'warn',
        icon: 'notice',
        title: `계약 만료일(${lapsed.endDate})이 지났지만 갱신 거절 통지 도달 기록이 없어요`,
        description: '같은 조건으로 2년 갱신된 것으로 봐요 · 갱신 계약을 등록해 기간을 맞추세요.',
        action: { kind: 'RENEW', label: '갱신 계약 등록', contractId: lapsed.id },
      },
    ];
  }
  // 중도 해지 예정: 통지는 필요 없고 퇴거(해지일)와, 새 임차인 계약이 있으면 입주를 알린다(C6).
  if (current?.isEndingEarly) {
    const items = [
      {
        id: 'move-out',
        tone: 'mute',
        icon: 'moveOut',
        title: `퇴거 점검 · ${current.endDate} 중도 해지${current.tenantName ? ` (${current.tenantName})` : ''}`,
        description: '집 상태 사진, 열쇠·출입카드 돌려받기, 공과금 정산 · 알림만(점검 목록 기능은 나중에)',
        dday: daysBetween(today, current.endDate),
      },
    ];
    if (next) {
      items.push({
        id: 'move-in',
        tone: 'seal',
        icon: 'moveIn',
        title: `입주 인수인계 · ${next.startDate}${next.tenantName ? ` (${next.tenantName})` : ''}`,
        description: '퇴거 사진과 같은 자리를 입주 사진으로 남겨 비교 · 새 임차인 앱 초대 · 알림만',
        dday: daysBetween(today, next.startDate),
      });
    }
    return items;
  }
  const notice = current?.renewalNotice;
  if (!current || !notice) return [];
  const items = [];

  if (nextKind === 'RENEWAL') {
    const window = computeNoticeWindow(next.endDate);
    items.push({
      id: 'renewed',
      tone: 'ok',
      icon: 'renewed',
      title: `갱신 계약 등록됨 · ${next.startDate}부터 ${getContractYears(next)}년`,
      description: '갱신 거절 통지 할 일은 사라져요. 임차인이 앱에서 새 계약을 확인하면 끝이에요.',
      action: { kind: 'CONTRACT', label: '갱신 계약 보기', contractId: next.id },
    });
    items.push({
      id: 'next-window',
      tone: 'later',
      icon: 'window',
      title: `다음 통지 기간 · ${window.windowStart} ~ ${window.safeDeadline}`,
      description: '갱신 계약이 시작되면 그 계약 기준으로 다시 계산해요.',
    });
    return items;
  }

  const isNewTenant = nextKind === 'NEW_TENANT';
  const daysToSafe = daysBetween(today, notice.safeDeadline);
  if (notice.hasDeliveredInTime) {
    items.push({
      id: 'notice-done',
      tone: 'ok',
      icon: 'renewed',
      title: '갱신 거절 통지 도달 기록이 있어요',
      description: notice.latestNotice?.deliveredOn ? `도달 ${notice.latestNotice.deliveredOn} · 계약 쪽 기록이에요.` : '계약 쪽 기록이에요.',
      action: { kind: 'CONTRACT', label: '계약 보기', contractId: current.id },
    });
  } else if (notice.phase === 'CLOSED') {
    // 통지 없이 마감이 지남 = 묵시적 갱신(H-27). 계약 날짜는 저절로 바뀌지 않는다.
    items.push({
      id: 'implicit-renewal',
      tone: 'warn',
      icon: 'notice',
      title: `통지 마감(${notice.deadline})이 지났어요`,
      description: '같은 조건 2년 갱신으로 봐요 · 갱신 계약을 등록해 기간을 맞추세요.',
      action: { kind: 'RENEW', label: '갱신 계약 등록', contractId: current.id },
    });
  } else if (notice.phase === 'BEFORE_WINDOW') {
    items.push({
      id: 'notice-window',
      tone: 'later',
      icon: 'window',
      title: `갱신 거절 통지 기간 · ${notice.windowStart} ~ ${notice.safeDeadline}`,
      description: '아직 멀었어요.',
    });
  } else {
    items.push({
      id: 'notice-deadline',
      tone: isNewTenant || notice.phase !== 'CLOSING_SOON' ? 'warn' : 'crit',
      icon: 'notice',
      title: isNewTenant
        ? `지금 임차인에게 갱신 거절 통지 · 권장 마감 ${notice.safeDeadline}`
        : `갱신 거절 통지 권장 마감 · ${notice.safeDeadline}`,
      description: isNewTenant
        ? '새 임차인 계약을 등록해도, 지금 임차인에게 통지가 도달하지 않으면 지금 계약이 2년 갱신될 수 있어요. 통지를 기록해 두세요.'
        : `이 날까지 임차인에게 통지가 도달하지 않으면 같은 조건으로 2년 갱신된 것으로 봐요. ${notice.latestNotice ? '도달한 통지 기록이 아직 없어요.' : '아직 통지 기록이 없어요.'}`,
      dday: daysToSafe,
      action: { kind: 'NOTICE', label: '통지 기록하기', contractId: current.id },
    });
  }

  const daysToEnd = daysBetween(today, current.endDate);
  if (isNewTenant) {
    items.push({
      id: 'move-out',
      tone: 'mute',
      icon: 'moveOut',
      title: `퇴거 점검 · ${current.endDate}${current.tenantName ? ` (${current.tenantName})` : ''}`,
      description: '집 상태 사진, 열쇠·출입카드 돌려받기, 공과금 정산 · 알림만(점검 목록 기능은 나중에)',
      dday: daysToEnd,
    });
    items.push({
      id: 'move-in',
      tone: 'seal',
      icon: 'moveIn',
      title: `입주 인수인계 · ${next.startDate}${next.tenantName ? ` (${next.tenantName})` : ''}`,
      description: '퇴거 사진과 같은 자리를 입주 사진으로 남겨 비교 · 새 임차인 앱 초대 · 알림만',
      dday: daysBetween(today, next.startDate),
    });
    return items;
  }

  items.push({
    id: 'contract-end',
    tone: 'mute',
    icon: 'end',
    title: `계약 만료 · ${current.endDate}`,
    description: '갱신하면 [갱신 계약 등록], 끝내면 퇴거 준비를 해요.',
    dday: daysToEnd,
    action: { kind: 'CONTRACT', label: '계약 보기', contractId: current.id },
  });
  items.push({
    id: 'move-out-later',
    tone: 'later',
    icon: 'checklist',
    title: '퇴거 점검 리스트 · 만료 1개월 전부터',
    description: '열쇠·출입카드 돌려받기, 집 상태 사진 남기기 (4단계 입주·퇴거에서) · 알림만',
  });
  return items;
};

// 전체 호실 한 줄의 상태 칩·다음 일 문구(H-28).
export const getHomeRowSummary = ({ current, nextKind, endedOn, isSold }, today) => {
  if (endedOn) return { tone: 'default', badge: `${endedOn} ${isSold ? '매도' : '소유 끝남'}`, next: '읽기 전용' };
  if (!current) return { tone: 'default', badge: '계약 없음', next: '진행 중인 계약이 없어요' };
  if (nextKind === 'RENEWAL') return { tone: 'success', badge: '갱신 확정', next: `갱신 계약 ${current.endDate} 뒤 시작` };
  const notice = current.renewalNotice;
  const daysToEnd = daysBetween(today, current.endDate);
  if (current.isEndingEarly) return { tone: 'warning', badge: `중도 해지 ${formatDday(daysToEnd)}`, next: nextKind === 'NEW_TENANT' ? '새 임차인 입주 예정' : '퇴거 준비' };
  if (!notice) return { tone: 'default', badge: `만료 ${formatDday(daysToEnd)}`, next: '할 일 없음' };
  if (notice.hasDeliveredInTime) return { tone: 'success', badge: `만료 ${formatDday(daysToEnd)}`, next: '통지 도달 기록 있음' };
  if (notice.phase === 'OPEN' || notice.phase === 'CLOSING_SOON') {
    return {
      tone: notice.phase === 'CLOSING_SOON' ? 'danger' : 'warning',
      badge: `통지 마감 ${formatDday(daysBetween(today, notice.safeDeadline))}`,
      next: notice.latestNotice ? '도달한 통지 기록 없음' : '갱신 거절 통지 기록 없음',
    };
  }
  if (notice.phase === 'CLOSED') return { tone: 'warning', badge: `만료 ${formatDday(daysToEnd)}`, next: '통지 없이 마감 지남' };
  return { tone: 'default', badge: '통지 기간 전', next: `통지 기간 ${notice.windowStart}부터` };
};

// 전체 호실 줄 순서(H-28): ① 통지가 필요한 호실(마감 가까운 순) ② 계약 있는 호실(만료 가까운 순) ③ 계약 없는 호실 ④ 소유가 끝난 호실(최근 끝난 순).
const rowRank = (row, today) => {
  if (row.endedOn) return [3, -toUtc(row.endedOn)];
  if (!row.current) return [2, 0];
  const notice = row.current.renewalNotice;
  if (notice && row.nextKind !== 'RENEWAL' && !notice.hasDeliveredInTime && notice.deadline >= today) return [0, toUtc(notice.deadline)];
  return [1, toUtc(row.current.endDate)];
};
export const sortHomeRows = (rows, today) =>
  [...rows].sort((a, b) => {
    const [ga, ka] = rowRank(a, today);
    const [gb, kb] = rowRank(b, today);
    if (ga !== gb) return ga - gb;
    if (ka !== kb) return ka - kb;
    return (a.property.displayName ?? '').localeCompare(b.property.displayName ?? '', 'ko');
  });

// 내 소유 관계 중 이 호실 것: 활성 우선, 없으면 가장 최근에 끝난 것.
export const pickOwnership = (ownerships = [], propertyId) => {
  const mine = ownerships.filter((ownership) => ownership.property?.id === propertyId);
  return mine.find((ownership) => !ownership.endedAt) ?? [...mine].sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1))[0] ?? null;
};

// 전체 호실 줄 만들기. homes: 호실 목록(지금·예전 소유), ownerships: 내 소유 관계 전부, contracts: 내 계약 전부(끝난 소유 포함),
// logs: 모든 호실 기록(축 시작부터). filter: { types, rooms }. 거르기가 있으면 matchCount·isDimmed(맞는 기록 없음).
export const buildHomeRows = ({ homes = [], ownerships = [], contracts = [], logs = [], filter = {}, today }) => {
  const hasFilter = (filter.types?.length ?? 0) > 0 || (filter.rooms?.length ?? 0) > 0;
  const rows = homes.map((property) => {
    const ownership = pickOwnership(ownerships, property.id);
    const endedOn = ownership?.endedAt ? toDateOnly(ownership.endedAt) : null;
    const own = contracts.filter((contract) => contract.ownershipId === ownership?.id);
    const { current, next, nextKind, past } = classifyContracts(own, { ownershipEndedOn: endedOn, today });
    // 소유가 끝난 호실은 마지막 계약을 끝난 날까지 그린다.
    const bar = current ?? (endedOn ? past.at(-1) : null) ?? null;
    const homeLogs = logs.filter((log) => (log.propertyId ?? log.property?.id) === property.id);
    const matched = homeLogs.filter((log) => matchesLogFilter(log, filter));
    return {
      property,
      ownership,
      endedOn,
      isSold: ownership?.endReason === 'SOLD',
      current,
      next,
      nextKind,
      bar,
      barEnd: bar ? (current ? current.endDate : getPastBarEnd(bar)) : null,
      logs: matched,
      matchCount: hasFilter ? matched.length : null,
      isDimmed: hasFilter && matched.length === 0,
    };
  });
  return sortHomeRows(rows, today);
};

// 전체 호실 축: 줄 막대 전부와 오늘을 담는다. 오늘에서 앞뒤 최대 4년.
export const computeAllHomesAxis = (rows, today) => {
  const starts = rows.filter((row) => row.bar).map((row) => row.bar.startDate);
  const ends = rows.filter((row) => row.barEnd).map((row) => row.barEnd);
  const lower = addYears(today, -PAST_CONTRACT_MAX_YEARS);
  const upper = addYears(today, PAST_CONTRACT_MAX_YEARS);
  const start = maxDate(minDate(today, addYears(today, -1), ...starts), lower);
  const end = minDate(maxDate(today, ...ends), upper);
  return { start, end };
};

// 눈금: 축 길이에 따라 3·6·12개월 간격, 매달 1일. 양 끝 가까운 눈금은 뺀다(끝 이름표와 겹치지 않게).
export const computeTicks = (axis, { edgeGap = 4 } = {}) => {
  const months = (Number(axis.end.slice(0, 4)) - Number(axis.start.slice(0, 4))) * 12 + Number(axis.end.slice(5, 7)) - Number(axis.start.slice(5, 7));
  const step = months <= 30 ? 3 : months <= 60 ? 6 : 12;
  const ticks = [];
  let cursor = `${axis.start.slice(0, 7)}-01`;
  if (cursor < axis.start) cursor = addMonths(cursor, 1);
  while (cursor <= axis.end) {
    const month = Number(cursor.slice(5, 7)) - 1;
    if (month % step === 0) {
      const percent = toPercent(cursor, axis);
      if (percent >= edgeGap && percent <= 100 - edgeGap) ticks.push({ date: cursor, percent, label: cursor.slice(0, 7) });
    }
    cursor = addMonths(cursor, 1);
  }
  return ticks;
};

// 작은 카드가 놓일 자리: 오른쪽 끝 근처는 왼쪽으로, 왼쪽 끝 근처는 오른쪽으로 펼친다.
export const getPopoverPlacement = (percent) => {
  if (percent > 75) return 'end';
  if (percent < 20) return 'start';
  return 'center';
};

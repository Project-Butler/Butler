// 묵시적 갱신(주택임대차보호법 제6조) 갱신 거절 통지 구간 계산(순수 함수, DB 의존 없음). 이슈 #157.
// 임대인이 계약 만료 6개월 전부터 2개월 전까지 갱신 거절(또는 조건 변경) 통지를 임차인에게 "도달"시키지 않으면
// 같은 조건으로 2년 갱신되고, 그 뒤에는 임차인만 해지할 수 있다(제6조의2, 통지 도달 후 3개월).
// 계약 상태처럼 저장하지 않고 응답마다 오늘(KST)로 계산한다 — contractStatus.js와 같은 성격.
import { computeContractStatus } from './contractStatus.js';
import { addDaysToDateString, compareDateStrings, daysBetween, subtractMonthsFromDateString, toDateOnlyString } from './dateUtils.js';

export const RENEWAL_NOTICE_WINDOW_START_MONTHS = 6;
export const RENEWAL_NOTICE_DEADLINE_MONTHS = 2;
// 마감까지 이 일수 이하로 남으면 CLOSING_SOON(알림도 30·7·1일 전에 보낸다).
export const RENEWAL_NOTICE_CLOSING_SOON_DAYS = 30;

export const RENEWAL_NOTICE_KINDS = ['REFUSE_RENEWAL', 'CHANGE_TERMS'];
export const RENEWAL_NOTICE_METHODS = ['CERTIFIED_MAIL', 'TEXT_MESSAGE', 'MESSENGER', 'EMAIL', 'IN_PERSON', 'OTHER'];

// 통지 구간. 마감일은 "만료일의 2개월 전 같은 날"이고, 그 날이 없는 달은 말일이다.
// 역산 방식(민법 제157조 이하)에 따라 하루 차이가 날 수 있어, 화면은 하루 이른 safeDeadline을 권장 마감으로 보여 준다.
export const computeRenewalNoticeWindow = (endDate) => {
  const end = typeof endDate === 'string' ? endDate : toDateOnlyString(endDate);
  const deadline = subtractMonthsFromDateString(end, RENEWAL_NOTICE_DEADLINE_MONTHS);
  return {
    windowStart: subtractMonthsFromDateString(end, RENEWAL_NOTICE_WINDOW_START_MONTHS),
    deadline,
    safeDeadline: addDaysToDateString(deadline, -1),
  };
};

// 오늘이 구간의 어디인지: BEFORE_WINDOW(구간 전) / OPEN / CLOSING_SOON(마감 30일 이하) / CLOSED(마감 지남).
export const computeRenewalNoticePhase = ({ windowStart, deadline }, todayKST) => {
  if (compareDateStrings(todayKST, windowStart) < 0) return 'BEFORE_WINDOW';
  if (compareDateStrings(todayKST, deadline) > 0) return 'CLOSED';
  return daysBetween(todayKST, deadline) <= RENEWAL_NOTICE_CLOSING_SOON_DAYS ? 'CLOSING_SOON' : 'OPEN';
};

// 기록한 통지 하나가 구간에 맞게 도달했는지: IN_TIME / TOO_EARLY(구간 전 도달) / LATE(마감 뒤 도달) / UNCONFIRMED(도달일 없음).
// 효력을 판단하는 것이 아니라 날짜만 비교한 결과다(화면에서 법률 자문이 아님을 함께 안내한다).
export const computeRenewalNoticeTiming = (notice, window) => {
  const deliveredOn = toDateOnlyString(notice.deliveredOn);
  if (!deliveredOn) return 'UNCONFIRMED';
  if (compareDateStrings(deliveredOn, window.windowStart) < 0) return 'TOO_EARLY';
  if (compareDateStrings(deliveredOn, window.deadline) > 0) return 'LATE';
  return 'IN_TIME';
};

// 통지 기록 응답. attachments는 호출하는 쪽이 붙인 문서 응답 목록이다.
export const toRenewalNoticeResponse = (notice, window, attachments = []) => ({
  id: notice.id,
  contractId: notice.contractId,
  kind: notice.kind,
  method: notice.method,
  sentOn: toDateOnlyString(notice.sentOn),
  deliveredOn: toDateOnlyString(notice.deliveredOn),
  timing: computeRenewalNoticeTiming(notice, window),
  memo: notice.memo ?? null,
  attachments,
  createdAt: notice.createdAt.toISOString(),
});

// 계약 응답의 renewalNotice 요약. 진행 중·시작 전 계약이고 소유 관계가 살아 있을 때만 값이 있다(그 밖은 null).
// notices: 그 계약의 통지 기록(최신순). 구간 판단에 필요한 칸만 쓴다.
export const toRenewalNoticeSummary = (contract, { todayKST, ownershipEnded = false, notices = [] }) => {
  const status = computeContractStatus(contract, todayKST);
  if (ownershipEnded || status === 'TERMINATED' || status === 'EXPIRED') return null;

  const window = computeRenewalNoticeWindow(contract.endDate);
  const latest = notices[0] ?? null;
  return {
    ...window,
    phase: computeRenewalNoticePhase(window, todayKST),
    daysUntilDeadline: daysBetween(todayKST, window.deadline),
    hasDeliveredInTime: notices.some((notice) => computeRenewalNoticeTiming(notice, window) === 'IN_TIME'),
    latestNotice: latest
      ? {
          id: latest.id,
          kind: latest.kind,
          method: latest.method,
          sentOn: toDateOnlyString(latest.sentOn),
          deliveredOn: toDateOnlyString(latest.deliveredOn),
          timing: computeRenewalNoticeTiming(latest, window),
        }
      : null,
  };
};

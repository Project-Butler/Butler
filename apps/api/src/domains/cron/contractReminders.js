// 매일 /api/cron/contract-reminders(KST 08:00): 계약 날짜에 맞춰 임대인에게 알림을 만든다(#159).
//   CONTRACT_EXPIRING_SOON        계약이 만료 임박(EXPIRING_SOON, 120일 이하)이 되면 한 번
//   RENEWAL_NOTICE_WINDOW_OPEN     갱신 거절 통지 구간(만료 6~2개월 전)이 열리면 한 번
//   RENEWAL_NOTICE_DEADLINE_SOON   통지 마감 30·7·1일 전
//   통지 알림 둘은 갱신 계약이 등록됐거나 기한 안에 도달한 통지 기록이 있으면 보내지 않는다(isRenewalNoticeSettled, #242).
//   RENT_PAYMENT_DUE               월세 입금일 당일(임대인만)
// 정기 작업이 하루 빠져도 다음 실행이 따라잡도록 "그 날"이 아니라 "그 구간에 들어왔는지"로 보고,
// dedupeKey로 같은 알림을 두 번 만들지 않는다(platform/notify.js notifyMany).
import { computeContractStatus } from '../../platform/contractStatus.js';
import { daysBetween, getTodayKST, toDateOnlyString } from '../../platform/dateUtils.js';
import { NOTIFICATION_TYPES, notifyMany } from '../../platform/notify.js';
import { prisma } from '../../platform/prismaClient.js';
import { toPropertySummary } from '../../platform/propertySerializer.js';
import { computeNextRentPaymentDate } from '../../platform/rentPayment.js';
import { isRenewalNoticeSettled, toRenewalNoticeSummary } from '../../platform/renewalNotice.js';
import { findRenewedContractIds } from '../../platform/renewedContracts.js';

// 마감 알림을 보내는 남은 일수. 실행이 빠졌으면 지금 남은 일수 이상인 가장 작은 단계 하나만 보낸다.
export const RENEWAL_DEADLINE_REMINDER_DAYS = [1, 7, 30];

const formatWon = (amount) => `${Number(amount).toLocaleString('ko-KR')}원`;

// contract: Prisma Contract + ownership(userId, endedAt, property+complex) + renewalNotices(deliveredOn). 순수 함수.
// renewed: 이 계약을 이어 가는 갱신 계약이 등록됐는지(platform/renewedContracts.js).
export const buildContractReminders = (contract, todayKST, { renewed = false } = {}) => {
  const { ownership } = contract;
  const status = computeContractStatus(contract, todayKST);
  if (ownership.endedAt || status === 'TERMINATED' || status === 'EXPIRED') return [];

  const name = toPropertySummary(ownership.property).displayName;
  const endDate = toDateOnlyString(contract.endDate);
  const base = {
    userId: ownership.userId,
    link: `/contracts/${contract.id}`,
    related: { resourceType: 'CONTRACT', resourceId: contract.id },
  };
  const items = [];

  if (status === 'EXPIRING_SOON') {
    items.push({
      ...base,
      type: NOTIFICATION_TYPES.CONTRACT_EXPIRING_SOON,
      title: '계약 만료가 다가와요',
      body: `${name} 계약이 ${endDate}에 끝나요(${daysBetween(todayKST, endDate)}일 남음).`,
      dedupeKey: `CONTRACT_EXPIRING_SOON:${contract.id}:${endDate}`,
    });
  }

  const notices = contract.renewalNotices ?? [];
  const renewal = toRenewalNoticeSummary(contract, { todayKST, notices });
  if (renewal && !isRenewalNoticeSettled(contract, { notices, renewed })) {
    if (renewal.phase === 'OPEN') {
      items.push({
        ...base,
        type: NOTIFICATION_TYPES.RENEWAL_NOTICE_WINDOW_OPEN,
        title: '갱신 거절 통지 기간이 시작됐어요',
        body: `${name} 계약을 같은 조건으로 이어 가지 않으려면 ${renewal.safeDeadline}까지 임차인에게 갱신 거절 통지가 도달해야 해요. 통지가 없으면 2년 갱신된 것으로 봐요.`,
        dedupeKey: `RENEWAL_NOTICE_WINDOW_OPEN:${contract.id}:${renewal.windowStart}`,
      });
    }
    const days = renewal.daysUntilDeadline;
    const step = days >= 0 ? RENEWAL_DEADLINE_REMINDER_DAYS.find((limit) => days <= limit) : undefined;
    if (step !== undefined) {
      items.push({
        ...base,
        type: NOTIFICATION_TYPES.RENEWAL_NOTICE_DEADLINE_SOON,
        title: days === 0 ? '오늘이 갱신 거절 통지 마감일이에요' : `갱신 거절 통지 마감 ${days}일 전이에요`,
        body: `${name} 갱신 거절 통지는 ${renewal.deadline}까지 임차인에게 도달해야 해요. 보낸 날이 아니라 받은 날이 기준이에요.`,
        dedupeKey: `RENEWAL_NOTICE_DEADLINE_SOON:${contract.id}:${renewal.deadline}:D${step}`,
      });
    }
  }

  if (computeNextRentPaymentDate(contract, { todayKST }) === todayKST) {
    items.push({
      ...base,
      type: NOTIFICATION_TYPES.RENT_PAYMENT_DUE,
      title: '오늘은 월세 입금일이에요',
      body: `${name} 월세 ${formatWon(contract.monthlyRent)} 입금일이에요.`,
      dedupeKey: `RENT_PAYMENT_DUE:${contract.id}:${todayKST}`,
    });
  }
  return items;
};

// 해지 안 됐고, 아직 끝나지 않았고, 소유 관계가 살아 있는 계약만 읽는다.
// landlordIds: 테스트·수동 실행에서 그 임대인들의 계약으로만 좁힐 때(정기 실행은 넘기지 않는다).
export const runContractReminders = async ({ client = prisma, todayKST = getTodayKST(), landlordIds } = {}) => {
  const contracts = await client.contract.findMany({
    where: {
      terminatedOn: null,
      endDate: { gte: new Date(`${todayKST}T00:00:00Z`) },
      ownership: { endedAt: null, ...(landlordIds ? { userId: { in: landlordIds } } : {}) },
    },
    include: {
      ownership: { select: { userId: true, endedAt: true, property: { include: { complex: true } } } },
      renewalNotices: { select: { deliveredOn: true } },
    },
  });
  const renewedIds = await findRenewedContractIds(client, contracts.map((contract) => contract.id));
  const items = contracts.flatMap((contract) => buildContractReminders(contract, todayKST, { renewed: renewedIds.has(contract.id) }));
  const created = await notifyMany(client, items);
  return { today: todayKST, contracts: contracts.length, planned: items.length, created };
};

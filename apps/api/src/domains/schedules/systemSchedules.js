// 계약에서 계산하는 SYSTEM 일정(api-contract.md 7장 "일정", #161). 저장하지 않고 조회할 때마다 만든다 —
// 계약을 고치면 같이 바뀌고 해지하면 사라진다. 순수 함수, DB 의존 없음.
//   CONTRACT_END             계약 종료일(임대인·연결된 임차인)
//   RENT_PAYMENT             월세 입금일(임대인, 조회 기간 안의 매달)
//   RENEWAL_NOTICE_DEADLINE  갱신 거절 통지 마감일(임대인, 만료 2개월 전 — platform/renewalNotice.js).
//                            갱신 계약이 등록됐거나 기한 안에 도달한 통지 기록이 있으면 넣지 않는다(isRenewalNoticeSettled, #242).
import { createHash } from 'node:crypto';
import { compareDateStrings, toDateOnlyString } from '../../platform/dateUtils.js';
import { toMoney } from '../../platform/money.js';
import { toPropertySummary } from '../../platform/propertySerializer.js';
import { computeRenewalNoticeWindow, isRenewalNoticeSettled } from '../../platform/renewalNotice.js';
import { listRentPaymentDates } from '../../platform/rentPayment.js';

// 같은 종류는 이 순서로 정렬한다(같은 날짜일 때).
export const SYSTEM_SCHEDULE_KINDS = ['RENEWAL_NOTICE_DEADLINE', 'RENT_PAYMENT', 'CONTRACT_END'];

const TITLES = {
  CONTRACT_END: '계약 만기',
  RENT_PAYMENT: '월세 입금일',
  RENEWAL_NOTICE_DEADLINE: '갱신 거절 통지 마감',
};

// SYSTEM 일정은 행이 없어서, 같은 일정이 늘 같은 id를 갖도록 키에서 UUID 모양 id를 만든다(SHA-1 기반, 버전 5 비트).
export const toSystemScheduleId = (key) => {
  const bytes = createHash('sha1').update(`butler-schedule:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const inRange = (date, { fromDate, toDate }) => compareDateStrings(date, fromDate) >= 0 && compareDateStrings(date, toDate) <= 0;

// contract: Prisma Contract + ownership.property(+complex) + (임대인) renewalNotices(deliveredOn). viewer: 'LANDLORD' | 'TENANT'.
// renewed: 이 계약을 이어 가는 갱신 계약이 등록됐는지(platform/renewedContracts.js).
// 해지 계약·끝난 소유 관계는 호출하는 쪽이 조회에서 뺀다.
export const buildContractSchedules = (contract, { viewer, fromDate, toDate, renewed = false }) => {
  const range = { fromDate, toDate };
  const property = toPropertySummary(contract.ownership.property);
  const item = (kind, date, amount = null) => ({
    id: toSystemScheduleId(`${kind}:${contract.id}:${date}`),
    source: 'SYSTEM',
    kind,
    title: TITLES[kind],
    memo: null,
    date,
    time: null,
    remindOn: null,
    amount,
    property,
    related: { resourceType: 'CONTRACT', resourceId: contract.id },
  });

  const items = [];
  const endDate = toDateOnlyString(contract.endDate);
  if (inRange(endDate, range)) items.push(item('CONTRACT_END', endDate));
  if (viewer !== 'LANDLORD') return items;

  for (const date of listRentPaymentDates(contract, range)) items.push(item('RENT_PAYMENT', date, toMoney(contract.monthlyRent)));
  const { deadline } = computeRenewalNoticeWindow(endDate);
  const settled = isRenewalNoticeSettled(contract, { notices: contract.renewalNotices ?? [], renewed });
  if (inRange(deadline, range) && !settled) items.push(item('RENEWAL_NOTICE_DEADLINE', deadline));
  return items;
};

// 날짜 → 종류 → 호실 이름 순.
export const compareSchedules = (a, b) =>
  compareDateStrings(a.date, b.date) ||
  SYSTEM_SCHEDULE_KINDS.indexOf(a.kind) - SYSTEM_SCHEDULE_KINDS.indexOf(b.kind) ||
  a.property.displayName.localeCompare(b.property.displayName, 'ko');

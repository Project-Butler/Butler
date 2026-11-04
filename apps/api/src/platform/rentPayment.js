// 월세 입금일 계산(순수 함수, DB 의존 없음). 계약 응답의 nextRentPaymentDate가 이 함수를 쓴다(#76).
// status처럼 저장하지 않고 응답마다 오늘(KST)로 계산한다 — contractStatus.js와 같은 성격.
import { computeContractStatus } from './contractStatus.js';
import { compareDateStrings, toDateOnlyString } from './dateUtils.js';

const pad = (value) => String(value).padStart(2, '0');

// 그달의 마지막 날짜(month는 1~12). 다음 달 0일 = 이번 달 말일.
const lastDayOfMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// year·month의 입금일 'YYYY-MM-DD'. 29~31일이 없는 달은 그달 말일(31 = "말일").
const paymentDateIn = (year, month, rentPaymentDay) =>
  `${year}-${pad(month)}-${pad(Math.min(rentPaymentDay, lastDayOfMonth(year, month)))}`;

// contract: { leaseType, rentPaymentDay, startDate, endDate, terminatedOn } (Prisma Contract 또는 같은 모양).
// 오늘(그리고 시작일) 이후 가장 가까운 입금일 하나. 계약 기간(시작일~해지일 ?? 종료일) 밖이면 null.
// 전세·값 없음·해지·만료·끝난 소유 관계도 null.
export const computeNextRentPaymentDate = (contract, { todayKST, ownershipEnded = false }) => {
  if (contract.leaseType !== 'MONTHLY' || !contract.rentPaymentDay || ownershipEnded) return null;
  const status = computeContractStatus(contract, todayKST);
  if (status === 'TERMINATED' || status === 'EXPIRED') return null;

  const startDate = toDateOnlyString(contract.startDate);
  // terminatedOn은 방어용이다(해지 계약은 위에서 이미 null).
  const lastDate = toDateOnlyString(contract.terminatedOn ?? contract.endDate);
  // 시작 전 계약은 시작일부터 센다.
  const from = compareDateStrings(startDate, todayKST) > 0 ? startDate : todayKST;

  const [year, month] = from.split('-').map(Number);
  let next = paymentDateIn(year, month, contract.rentPaymentDay);
  if (compareDateStrings(next, from) < 0) {
    next = month === 12 ? paymentDateIn(year + 1, 1, contract.rentPaymentDay) : paymentDateIn(year, month + 1, contract.rentPaymentDay);
  }
  return compareDateStrings(next, lastDate) <= 0 ? next : null;
};

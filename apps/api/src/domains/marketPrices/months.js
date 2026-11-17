// 달 · 날짜 계산(한국 시간). 계약월은 'YYYY-MM', 날짜는 'YYYY-MM-DD'.

import { INCLUDE_CURRENT_MONTH, KEEP_MONTHS } from './marketPriceRules.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 한국 날짜 'YYYY-MM-DD'
export const kstDate = (date) => new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
export const kstYearMonth = (date) => kstDate(date).slice(0, 7);

export const isYearMonth = (text) => typeof text === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(text);

const toIndex = (yearMonth) => Number(yearMonth.slice(0, 4)) * 12 + Number(yearMonth.slice(5, 7)) - 1;
const fromIndex = (index) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
export const shiftYearMonth = (yearMonth, delta) => fromIndex(toIndex(yearMonth) + delta);

// from ~ to (둘 다 포함, 오름차순)
export const yearMonthsBetween = (from, to) => {
  const list = [];
  for (let index = toIndex(from); index <= toIndex(to); index += 1) list.push(fromIndex(index));
  return list;
};

// 보관 기간의 달들(오름차순) — 이번 달(한국 시간)부터 거꾸로 KEEP_MONTHS 개
export const retentionMonths = (now) => {
  const last = INCLUDE_CURRENT_MONTH ? kstYearMonth(now) : shiftYearMonth(kstYearMonth(now), -1);
  return yearMonthsBetween(shiftYearMonth(last, -(KEEP_MONTHS - 1)), last);
};

// 'YYYY-MM' 의 첫날 · 마지막 날(UTC 자정 Date — DB date 칸과 비교용)
export const firstDayOf = (yearMonth) => new Date(`${yearMonth}-01T00:00:00Z`);
export const lastDayOf = (yearMonth) => {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0));
};

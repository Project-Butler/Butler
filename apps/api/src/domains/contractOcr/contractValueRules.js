// Created: 2026-11-19
// LLM이 뽑은 계약 값을 서버 규칙으로 다시 확인한다(순수 함수, DB 의존 없음).
// 1) 원문 근거: source가 OCR 원문에 실제로 있고, value가 source에서 읽히는 값과 같은지
// 2) 값끼리: 전세면 월세 0, 종료일 > 시작일, 납부일 1~31, 금액 0 이상(계약 저장 규칙과 같음)
// 3) 대조(저장 안 함): 소재지 동·호, 임대인 이름
// 통과한 값만 fields에 넣고, 나머지는 null로 둔다. 걸러 낸 이유는 warnings로 돌려준다.
import {
  LEASE_TYPES,
  isRentPaymentDayInRange,
  isValidAmount,
  isValidDateString,
  normalizeTenantPhone,
} from '../../platform/contractRules.js';

export const MAX_MEMO_LENGTH = 1000;
const MAX_TENANT_NAME_LENGTH = 30;

// 공백을 모두 지워 비교한다(OCR은 글자 사이에 공백을 넣거나 빼기도 한다).
const compact = (value) => String(value ?? '').replace(/\s+/g, '');

const field = (extracted, name) => {
  const item = extracted?.[name];
  return {
    value: typeof item?.value === 'string' ? item.value.trim() : '',
    source: typeof item?.source === 'string' ? item.source.trim() : '',
  };
};

// source가 원문 안에 있는지. 빈 source는 근거가 없는 것으로 본다.
export const isInText = (text, source) => {
  const needle = compact(source);
  return needle.length > 0 && compact(text).includes(needle);
};

// ── 금액 ────────────────────────────────────────────────

const KOREAN_DIGITS = { 영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const SMALL_UNITS = { 십: 10n, 백: 100n, 천: 1000n };
const BIG_UNITS = { 만: 10_000n, 억: 100_000_000n, 조: 1_000_000_000_000n };
const AMOUNT_RUN = /[0-9,일이삼사오육칠팔구영공십백천만억조]+/g;

// "1억2천만", "일억이천", "120,000,000" 같은 한 덩어리를 원 단위 BigInt로. 읽을 수 없으면 null.
const parseAmountRun = (run) => {
  const chars = run.replace(/,/g, '');
  if (!chars) return null;
  let total = 0n;
  let section = 0n;
  let current = null;
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (/\d/.test(ch)) {
      let j = i;
      while (j < chars.length && /\d/.test(chars[j])) j += 1;
      current = BigInt(chars.slice(i, j));
      i = j;
      continue;
    }
    if (ch in KOREAN_DIGITS) current = BigInt(KOREAN_DIGITS[ch]);
    else if (ch in SMALL_UNITS) {
      section += (current ?? 1n) * SMALL_UNITS[ch];
      current = null;
    } else if (ch in BIG_UNITS) {
      const amount = section + (current ?? 0n);
      total += (amount === 0n ? 1n : amount) * BIG_UNITS[ch];
      section = 0n;
      current = null;
    }
    i += 1;
  }
  return total + section + (current ?? 0n);
};

// source 안에서 읽히는 금액 후보 전부. "금 일억원정(₩100,000,000)"이면 한글·숫자 두 쪽 다 후보가 된다.
export const parseAmountCandidates = (source) => {
  // "일금"·"금"·"원정"의 "일"·"정"이 숫자로 읽히지 않게 먼저 지운다.
  const cleaned = compact(source).replace(/일금|금|원정|원|정|₩|￦/g, ' ');
  const candidates = new Set();
  for (const run of cleaned.match(AMOUNT_RUN) ?? []) {
    const amount = parseAmountRun(run);
    if (amount !== null) candidates.add(amount);
  }
  return candidates;
};

const toAmount = (value) => (/^\d+$/.test(value) ? BigInt(value) : null);

// ── 날짜 ────────────────────────────────────────────────

const DATE_IN_SOURCE = /(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})/g;

export const parseDateCandidates = (source) => {
  const candidates = new Set();
  for (const [, y, m, d] of source.matchAll(DATE_IN_SOURCE)) {
    candidates.add(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
  }
  return candidates;
};

// ── 월세 납부일 ─────────────────────────────────────────

export const parsePaymentDayCandidates = (source) => {
  const candidates = new Set();
  if (/말일/.test(source)) candidates.add(31);
  for (const [, day] of source.matchAll(/(\d{1,2})\s*일/g)) candidates.add(Number(day));
  // 표 칸에 숫자만 적힌 경우("25")
  if (/^\d{1,2}$/.test(compact(source))) candidates.add(Number(compact(source)));
  return candidates;
};

// ── 전체 확인 ───────────────────────────────────────────

const WARNING_MESSAGES = {
  NO_EVIDENCE: '계약서에서 근거를 찾지 못해 비워 뒀어요.',
  INCONSISTENT: '다른 값과 맞지 않아 비워 뒀어요.',
  INVALID: '형식이 맞지 않아 비워 뒀어요.',
  ADDRESS_NOT_FOUND: '계약서에서 소재지를 찾지 못했어요. 호실이 맞는지 확인해 주세요.',
  UNIT_MISMATCH: '계약서 소재지의 동·호가 선택한 호실과 달라요. 호실이 맞는지 확인해 주세요.',
  LANDLORD_NOT_FOUND: '계약서에서 임대인 이름을 찾지 못했어요.',
  LANDLORD_MISMATCH: '계약서의 임대인 이름이 회원 이름과 달라요. 내 계약서가 맞는지 확인해 주세요.',
};

const toWarning = (fieldName, code) => ({ field: fieldName, code, message: WARNING_MESSAGES[code] });

// 동·호 표기: "101동 1203호" 또는 "101-1203". 동이 없는 건물(buildingNo 빈 값)은 호만 본다.
const matchesUnit = (address, { buildingNo, unitNo }) => {
  const text = compact(address);
  const hasUnit = text.includes(`${unitNo}호`);
  if (!buildingNo) return hasUnit;
  return (text.includes(`${buildingNo}동`) && hasUnit) || text.includes(`${buildingNo}-${unitNo}`);
};

// text: 민감정보를 지운 OCR 원문, extracted: LLM 응답, property: { buildingNo, unitNo }, landlordName: 회원 이름
export const reviewExtractedValues = ({ text, extracted, property, landlordName }) => {
  const fields = {
    leaseType: null,
    deposit: null,
    monthlyRent: null,
    rentPaymentDay: null,
    startDate: null,
    endDate: null,
    tenantName: null,
    tenantPhone: null,
    memo: null,
  };
  const warnings = [];
  // 값은 있는데 근거·형식이 틀리면 경고를 남기고 비운다. 값이 아예 없으면 경고 없이 비운다(화면이 빈 칸으로 보여 준다).
  const reject = (name, code) => warnings.push(toWarning(name, code));

  // 계약 유형: source에 "전세"·"월세"(또는 "차임")가 있어야 한다.
  const leaseType = field(extracted, 'leaseType');
  if (leaseType.value) {
    const keyword = leaseType.value === 'JEONSE' ? /전세/ : /월세|차임/;
    if (!LEASE_TYPES.includes(leaseType.value)) reject('leaseType', 'INVALID');
    else if (!isInText(text, leaseType.source) || !keyword.test(leaseType.source)) reject('leaseType', 'NO_EVIDENCE');
    else fields.leaseType = leaseType.value;
  }

  // 금액: value가 source에서 읽히는 금액 후보 중 하나와 같아야 한다.
  const checkAmount = (name) => {
    const { value, source } = field(extracted, name);
    if (!value) return;
    const amount = toAmount(value);
    if (amount === null || amount > BigInt(Number.MAX_SAFE_INTEGER)) return reject(name, 'INVALID');
    if (!isInText(text, source) || !parseAmountCandidates(source).has(amount)) return reject(name, 'NO_EVIDENCE');
    fields[name] = amount;
  };
  checkAmount('deposit');
  // 전세 월세 0은 계약서에 따로 적혀 있지 않은 경우가 많아 근거 없이 받는다.
  if (fields.leaseType === 'JEONSE' && ['', '0'].includes(field(extracted, 'monthlyRent').value)) fields.monthlyRent = 0n;
  else checkAmount('monthlyRent');

  // 날짜
  const checkDate = (name) => {
    const { value, source } = field(extracted, name);
    if (!value) return;
    if (!isValidDateString(value)) return reject(name, 'INVALID');
    if (!isInText(text, source) || !parseDateCandidates(source).has(value)) return reject(name, 'NO_EVIDENCE');
    fields[name] = value;
  };
  checkDate('startDate');
  checkDate('endDate');

  // 월세 납부일
  const paymentDay = field(extracted, 'rentPaymentDay');
  if (paymentDay.value) {
    const day = Number(paymentDay.value);
    if (!isRentPaymentDayInRange(day)) reject('rentPaymentDay', 'INVALID');
    else if (!isInText(text, paymentDay.source) || !parsePaymentDayCandidates(paymentDay.source).has(day)) reject('rentPaymentDay', 'NO_EVIDENCE');
    else fields.rentPaymentDay = day;
  }

  // 임차인 이름: 이름 자체가 원문에 있어야 한다.
  const tenantName = field(extracted, 'tenantName');
  if (tenantName.value) {
    if (tenantName.value.length > MAX_TENANT_NAME_LENGTH) reject('tenantName', 'INVALID');
    else if (!isInText(text, tenantName.value)) reject('tenantName', 'NO_EVIDENCE');
    else fields.tenantName = tenantName.value;
  }

  // 임차인 휴대폰: 010 형식이고, 숫자가 원문의 숫자 안에 그대로 있어야 한다.
  const tenantPhone = field(extracted, 'tenantPhone');
  if (tenantPhone.value) {
    const phone = normalizeTenantPhone(tenantPhone.value);
    const sourceDigits = tenantPhone.source.replace(/\D/g, '');
    if (!phone) reject('tenantPhone', 'INVALID');
    else if (!isInText(text, tenantPhone.source) || !sourceDigits.includes(phone)) reject('tenantPhone', 'NO_EVIDENCE');
    else fields.tenantPhone = phone;
  }

  // 특약 → 메모. 원문 문장을 그대로 옮긴 것이라 source 확인 대신 value가 원문에 있는지만 본다. 1,000자에서 자른다.
  let memoTruncated = false;
  const specialTerms = field(extracted, 'specialTerms');
  if (specialTerms.value) {
    if (!isInText(text, specialTerms.value)) reject('memo', 'NO_EVIDENCE');
    else {
      memoTruncated = specialTerms.value.length > MAX_MEMO_LENGTH;
      fields.memo = specialTerms.value.slice(0, MAX_MEMO_LENGTH);
    }
  }

  // 값끼리: 계약 저장 규칙(platform/contractRules.js)과 같은 기준. 어긋나면 관련 칸을 함께 비운다.
  const clear = (names) => {
    for (const name of names) {
      if (fields[name] === null) continue;
      fields[name] = null;
      reject(name, 'INCONSISTENT');
    }
  };
  if (fields.leaseType && fields.deposit !== null && fields.monthlyRent !== null) {
    if (!isValidAmount(fields)) clear(['leaseType', 'deposit', 'monthlyRent']);
  } else if (fields.leaseType === 'MONTHLY' && fields.monthlyRent === 0n) {
    clear(['monthlyRent']);
  }
  if (fields.leaseType === 'JEONSE' && fields.rentPaymentDay !== null) clear(['rentPaymentDay']);
  if (fields.startDate && fields.endDate && fields.endDate <= fields.startDate) clear(['startDate', 'endDate']);

  // 대조(저장 안 함)
  const address = field(extracted, 'propertyAddress');
  const addressText = isInText(text, address.source) ? address.source : isInText(text, address.value) ? address.value : '';
  if (!addressText) warnings.push(toWarning(null, 'ADDRESS_NOT_FOUND'));
  else if (!matchesUnit(addressText, property)) warnings.push(toWarning(null, 'UNIT_MISMATCH'));

  const landlord = field(extracted, 'landlordName');
  if (!landlord.value || !isInText(text, landlord.value)) warnings.push(toWarning(null, 'LANDLORD_NOT_FOUND'));
  else if (compact(landlord.value) !== compact(landlordName)) warnings.push(toWarning(null, 'LANDLORD_MISMATCH'));

  return {
    fields: {
      ...fields,
      deposit: fields.deposit === null ? null : Number(fields.deposit),
      monthlyRent: fields.monthlyRent === null ? null : Number(fields.monthlyRent),
    },
    memoTruncated,
    warnings,
  };
};

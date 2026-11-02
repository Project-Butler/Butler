// 호실·소유 정보 입력값 형식 검사. 범위는 서버 검증(apps/api properties·propertyOwnerships controller,
// platform/requestValidation.js)과 같다. 빈 값은 검사하지 않는다(선택 값). 오류면 문구, 아니면 undefined.
import { formatDateKST } from './format';

const MAX_EXCLUSIVE_AREA = 999999.99;
const EXCLUSIVE_AREA_PATTERN = /^\d+(\.\d{1,2})?$/;
const FLOOR_PATTERN = /^-?\d+$/;
const MIN_FLOOR = -10;
const MAX_FLOOR = 200;
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const validateExclusiveArea = (value) => {
  if (!value) return undefined;
  if (!EXCLUSIVE_AREA_PATTERN.test(value) || Number(value) <= 0 || Number(value) > MAX_EXCLUSIVE_AREA) {
    return '0보다 큰 숫자로, 소수 둘째 자리까지 입력해 주세요.';
  }
  return undefined;
};

export const validateFloor = (value) => {
  if (!value) return undefined;
  if (!FLOOR_PATTERN.test(value) || Number(value) < MIN_FLOOR || Number(value) > MAX_FLOOR) {
    return `${MIN_FLOOR}~${MAX_FLOOR} 사이의 정수로 입력해 주세요.`;
  }
  return undefined;
};

export const validateAcquiredYearMonth = (value) => {
  if (!value) return undefined;
  if (!YEAR_MONTH_PATTERN.test(value)) return 'YYYY-MM 형식으로 입력해 주세요. 예: 2019-03';
  // KST 기준 이번 달 이하
  if (value > formatDateKST(new Date().toISOString()).slice(0, 7)) return '이번 달 이후로는 입력할 수 없어요.';
  return undefined;
};

export const validatePurchasePrice = (value) => {
  if (!value) return undefined;
  return Number.isSafeInteger(Number(value)) ? undefined : '금액을 다시 확인해 주세요.';
};

// 입력 칸 onChange 정리용
export const toAreaInput = (value) => value.replace(/[^\d.]/g, '');
export const toFloorInput = (value) => value.replace(/[^\d-]/g, '');
export const toYearMonthInput = (value) => value.replace(/[^\d-]/g, '');
// 매입가는 숫자만 저장하고(앞자리 0 제거) 화면에는 콤마를 붙여 보여 준다.
export const toPriceDigits = (value) => value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');

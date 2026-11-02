// POST /admin/complexes 본문 검증(api-contract.md 8장). 계약의 다섯 칸만 받는다.
// sourceKey는 선택 — 비우면 서비스가 'ADMIN:<uuid>'를 만든다. 주소는 도로명·지번 중 하나는 있어야 한다.
import { assertAllowedBody, throwIfInvalid } from '../../platform/requestValidation.js';

export const COMPLEX_FIELDS = ['name', 'jibunAddress', 'roadAddress', 'legalDongCode', 'sourceKey'];

const MAX_LENGTH = { name: 100, jibunAddress: 200, roadAddress: 200, sourceKey: 100 };
const LEGAL_DONG_CODE_PATTERN = /^\d{10}$/;

// 문자열이면 앞뒤 공백을 떼고, 비어 있으면 null.
const parseText = (body, field, details) => {
  const value = body[field];
  if (value !== undefined && value !== null && typeof value !== 'string') {
    details.push({ field, reason: '문자열이어야 합니다.' });
    return null;
  }
  const text = value?.trim() || null;
  const max = MAX_LENGTH[field];
  if (text && max && text.length > max) details.push({ field, reason: `${max}자 이하여야 합니다.` });
  return text;
};

export const parseComplexBody = (body) => {
  const input = body ?? {};
  assertAllowedBody(input, COMPLEX_FIELDS);
  const details = [];
  const [name, jibunAddress, roadAddress, legalDongCode, sourceKey] = COMPLEX_FIELDS.map((field) => parseText(input, field, details));

  if (!name) details.push({ field: 'name', reason: '단지명을 입력해 주세요.' });
  if (!legalDongCode) details.push({ field: 'legalDongCode', reason: '법정동코드를 입력해 주세요.' });
  else if (!LEGAL_DONG_CODE_PATTERN.test(legalDongCode)) details.push({ field: 'legalDongCode', reason: '10자리 숫자여야 합니다.' });
  if (!jibunAddress && !roadAddress) details.push({ field: 'roadAddress', reason: '도로명주소나 지번주소 중 하나는 입력해 주세요.' });

  throwIfInvalid(details);
  return { name, jibunAddress, roadAddress, legalDongCode, sourceKey };
};

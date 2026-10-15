// BigInt로 저장한 금액 필드를 응답 직전에 JS Number로 바꾸는 공용 함수.
// (api-contract.md 1장 "날짜·금액·null": 금액은 DB bigint, 응답 직전에만 Number로)
//
// DB 저장·비교·합산 등 연산은 반드시 BigInt로 하고, 이 함수는 res.json()으로
// 나가기 직전에만 쓴다 — JSON.stringify는 BigInt를 직렬화하지 못해 그대로 넘기면
// 런타임 에러가 난다. 원화 금액은 Number.MAX_SAFE_INTEGER(약 9천조)를 넘을 일이
// 없으므로 변환해도 정밀도 손실이 없다.
export const toMoney = (value) => {
  if (value === null || value === undefined) return value;
  return Number(value);
};

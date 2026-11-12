// 금액(원 단위 정수)을 '50,000,000원'으로 보여 준다. 값이 없으면 '-'.
export const formatWon = (value) => (value == null ? '-' : `${value.toLocaleString('ko-KR')}원`);

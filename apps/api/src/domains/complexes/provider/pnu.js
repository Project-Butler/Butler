// PNU(필지 고유번호, 19자리) 조립·분해와 법정동 코드 롤업. 순수 함수만 둔다(DB·외부 호출 없음).
//
// PNU 형식: 법정동 코드 10자리 + 산 구분 1자리(1 = 일반, 2 = 산) + 본번 4자리 + 부번 4자리.
// 법정동 코드는 juso의 admCd를 **리 단위 10자리 그대로** 쓴다. 읍면동 단위로 올리는(롤업) 건
// Complex.regionId에만 한다.

const LEGAL_DONG_CODE_PATTERN = /^\d{10}$/;
const LOT_NUMBER_PATTERN = /^\d{1,4}$/;
const PNU_PATTERN = /^\d{19}$/;

// juso 응답 값으로 PNU를 만든다. 형식이 틀린 값이 하나라도 있으면 null.
// mtYn은 juso 표기('0' 일반, '1' 산), mainNo·subNo는 '17'처럼 0이 안 채워진 값도 받는다.
export const buildPnu = (admCd, mtYn, mainNo, subNo) => {
  const legalDongCode = String(admCd ?? '');
  const main = String(mainNo ?? '');
  const sub = String(subNo ?? '0') || '0';

  if (!LEGAL_DONG_CODE_PATTERN.test(legalDongCode)) return null;
  if (!LOT_NUMBER_PATTERN.test(main) || !LOT_NUMBER_PATTERN.test(sub)) return null;

  const mountainDigit = String(mtYn) === '1' ? '2' : '1';
  return `${legalDongCode}${mountainDigit}${main.padStart(4, '0')}${sub.padStart(4, '0')}`;
};

// PNU를 juso 표기로 되돌린다. 'PNU:' 접두어가 붙어 있어도 받는다. 형식이 틀리면 null.
// mainNo·subNo는 PNU 자리 그대로(4자리, 0 채움) 돌려준다.
export const parsePnu = (pnu) => {
  const value = String(pnu ?? '').replace(/^PNU:/, '');
  if (!PNU_PATTERN.test(value)) return null;

  const mountainDigit = value.slice(10, 11);
  if (mountainDigit !== '1' && mountainDigit !== '2') return null;

  return {
    admCd: value.slice(0, 10),
    mtYn: mountainDigit === '2' ? '1' : '0',
    mainNo: value.slice(11, 15),
    subNo: value.slice(15, 19),
  };
};

// 리 단위 코드(끝 2자리 ≠ 00)를 읍면동 코드로 올린다. 이미 읍면동이면 그대로다.
// regions 테이블은 읍면동 단위만 갖고 있어서 Complex.regionId는 항상 이 값을 쓴다.
export const rollUpLegalDongCode = (code) => `${String(code).slice(0, 8)}00`;

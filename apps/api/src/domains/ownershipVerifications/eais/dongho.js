// Created: 2026-10-21 04:31
// 동·호 정규화. 원본: eais-ledger src/lib/dongho.ts (발급 대상 대조에 쓰는 함수만 옮겼다)
// 같은 호실을 가리키는 서로 다른 표기("101동 202호", "제101동 제202호", "101-202")를 하나로 맞춘다.
// 규칙(사용자 확정 2026-09-23):
//   - 공백 제거, 영문은 대문자
//   - 접두어 "제" 제거, 접미어 "동"·"호" 제거
//   - 지하 표기("지하", "비", "B")는 "B" 접두로 통일
//   - "지하N층 M호" → "B" + N + M(2자리)   예) 지하1층 1호 → B101
//     단, M이 이미 3자리 이상(층 포함)이면 "B" + M   예) 제비1층 제비101호 → B101
//   - "101-202"(숫자-숫자)는 동-호로 해석
//   - 호의 앞자리 0은 제거 (0202 → 202, B01 → B1, 0000 → 0)

// 호의 앞자리 0 제거: "0202" → "202", "B01" → "B1", "0000" → "0"
const stripLeadingZeros = (ho) => ho.replace(/^(B?)0+(?=\d)/, '$1');

// 동 또는 호 한 조각 정규화: 공백·"제"·접미어 제거, 지하 → B
const cleanPart = (raw, suffix) => {
  let s = raw.replace(/\s+/g, '').toUpperCase();
  s = s.replace(/^제/, '');
  if (s.endsWith(suffix)) s = s.slice(0, -1);
  s = s.replace(/^제/, '');
  // 지하 표기 통일: "지하101" / "비101" → "B101"
  s = s.replace(/^(지하|비)(?=[0-9])/, 'B');
  if (suffix === '호') s = stripLeadingZeros(s);
  return s || null;
};

// 동·호가 섞인 한 줄 표기를 { dong, ho } 로 분리·정규화한다. 예) "101동 202호" → { dong: "101", ho: "202" }
export const parseDongHo = (input) => {
  const s = (input ?? '').replace(/\s+/g, '').toUpperCase();
  if (!s) return { dong: null, ho: null };

  // "지하N층 M호" / "비N층 M호" → B + N + M(2자리)
  const basementFloor = s.match(/^(?:제)?(?:지하|비|B)(\d+)층(?:제)?(?:지하|비|B)?(\d+)호?$/);
  if (basementFloor) {
    const [, floor, num] = basementFloor;
    // 호 번호가 이미 층을 포함한 3자리 이상이면 그대로(비1층 비101호 → B101), 아니면 층+2자리(지하1층 1호 → B101)
    const ho = num.length >= 3 ? `B${num}` : `B${floor}${num.padStart(2, '0')}`;
    return { dong: null, ho: stripLeadingZeros(ho) };
  }

  // "101-202" (숫자-숫자) → 동-호
  const dash = s.match(/^(\d+)-(\d+)$/);
  if (dash) return { dong: dash[1], ho: stripLeadingZeros(dash[2]) };

  // "...동 ...호" / "...동"
  const dongIdx = s.indexOf('동');
  if (dongIdx > 0) {
    const dong = cleanPart(s.slice(0, dongIdx + 1), '동');
    const rest = s.slice(dongIdx + 1);
    return { dong, ho: rest ? cleanPart(rest, '호') : null };
  }

  // 호만 있는 경우 ("202호", "제202호", "B01", "지하101호")
  return { dong: null, ho: cleanPart(s, '호') };
};

// 동 입력칸 값 하나 정규화
export const normalizeDong = (v) => (v ? cleanPart(v, '동') : null);

// 호 입력칸 값 하나 정규화 ("지하1층 1호" 같은 층 표기 포함). "101동 202호"처럼 동까지 들어오면 호만 취한다
export const normalizeHo = (v) => (v ? parseDongHo(v).ho : null);

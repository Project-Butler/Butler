// 오타 제안("혹시 ○○을(를) 찾으셨나요?")에 쓰는 한글 자모 비교. DB를 쓰지 않는 순수 함수만 둔다(사전 만들기·검색은 service.js).
// 글자 단위로 비교하면 "보증굼"과 "보증금"이 한 글자 다름이지만 "보증굼"과 "보중금"도 한 글자 다름이라 구분이 안 된다.
// 자모로 나누면 ㅜ↔ㅡ 한 개 차이로 잴 수 있어, 한글 오타(모음·받침 하나 틀림)에 잘 맞는다.
// pg_trgm(세 글자 조각)은 DB 확장·마이그레이션이 필요하고 두세 글자 한글 낱말에는 너무 거칠어서 쓰지 않는다.

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const JUNG_COUNT = 21;
const JONG_COUNT = 28;

// 초성·중성·종성 번호를 서로 겹치지 않는 문자로 바꾼다(비교만 하면 되므로 실제 자모 글자일 필요는 없다).
const CHO_BASE = 0x1100;
const JUNG_BASE = 0x1161;
const JONG_BASE = 0x11a7;

// "보증금" → 초성·중성·종성 자모 문자열. 한글 음절이 아닌 글자는 그대로 둔다.
export const toJamo = (word) =>
  [...word]
    .map((char) => {
      const code = char.codePointAt(0);
      if (code < HANGUL_START || code > HANGUL_END) return char;
      const index = code - HANGUL_START;
      const cho = Math.floor(index / (JUNG_COUNT * JONG_COUNT));
      const jung = Math.floor((index % (JUNG_COUNT * JONG_COUNT)) / JONG_COUNT);
      const jong = index % JONG_COUNT;
      return (
        String.fromCharCode(CHO_BASE + cho) +
        String.fromCharCode(JUNG_BASE + jung) +
        (jong > 0 ? String.fromCharCode(JONG_BASE + jong) : '')
      );
    })
    .join('');

// 소리가 같거나 비슷해 가장 흔히 틀리는 모음(ㅐ·ㅔ·ㅒ·ㅖ, ㅙ·ㅚ·ㅞ). 서로 바꾼 것은 반 개 차이로 센다 —
// "전새"는 "전세"(ㅐ→ㅔ, 0.5)가 "전대"(ㅅ→ㄷ, 1)보다 가깝다.
const CONFUSABLE_VOWEL_GROUPS = [
  [1, 3, 5, 7], // ㅐ ㅒ ㅔ ㅖ
  [10, 11, 15], // ㅙ ㅚ ㅞ
].map((group) => new Set(group.map((index) => String.fromCharCode(JUNG_BASE + index))));
const CONFUSABLE_COST = 0.5;

const substitutionCost = (a, b) => {
  if (a === b) return 0;
  return CONFUSABLE_VOWEL_GROUPS.some((group) => group.has(a) && group.has(b)) ? CONFUSABLE_COST : 1;
};

// 편집 거리(넣기·빼기·바꾸기 한 번이 1, 헷갈리는 모음끼리 바꾸기는 0.5). limit을 넘으면 더 세지 않고 limit + 1을 돌려준다.
export const editDistance = (a, b, limit) => {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = substitutionCost(a[i - 1], b[j - 1]);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
};

// 허용하는 자모 차이: 두 글자 말은 1개(모음·받침 하나), 세 글자 이상은 2개.
// 두 글자 말에 2개를 허용하면 "월세"→"전세"처럼 다른 낱말로 바뀌기 쉽다.
export const maxTypoDistance = (word) => ([...word].length <= 2 ? 1 : 2);

const isHangulWord = (word) => /^[가-힣]+$/.test(word);

// 낱말 사전에서 word와 가장 가까운 다른 낱말 { word, distance, docCount }. 거리가 같으면 자료에 많이 나온 말. 없으면 null.
// 사전은 { word, jamo, docCount } 목록(service.js가 만들어 둔다). word 자신은 건너뛴다(자료에 오자로 몇 번 나온 말도 고칠 수 있게).
export const findClosestWord = (word, vocabulary) => {
  if (!isHangulWord(word) || [...word].length < 2) return null;
  const jamo = toJamo(word);
  const limit = maxTypoDistance(word);
  let best = null;
  for (const entry of vocabulary) {
    if (entry.word === word) continue;
    const distance = editDistance(jamo, entry.jamo, limit);
    if (distance > limit) continue;
    if (!best || distance < best.distance || (distance === best.distance && entry.docCount > best.docCount)) {
      best = { word: entry.word, distance, docCount: entry.docCount };
    }
  }
  return best;
};

// ── 한/영 전환 오타 ──
// 한글 자판인 줄 알고 영문 상태로 친 검색어("qhwmdrma")를 두벌식 자판 그대로 한글로 바꾼다("보증금").
// 네이버·다음의 "한/영 변환"과 같은 기능. 바꾼 말이 자료에 있는지는 service.js가 본다.
const CHO_LIST = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG_LIST = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG_LIST = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

// 두벌식 자판. 대문자는 Shift로 치는 쌍자음·ㅒ·ㅖ만 따로 있고 나머지는 소문자와 같다.
const KEYBOARD = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
  Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ',
};

// 모음 두 개·받침 두 개를 이어 치면 하나로 합쳐지는 것(ㅗ+ㅏ=ㅘ, ㄹ+ㄱ=ㄺ)
const COMPOUND_VOWELS = { ㅗㅏ: 'ㅘ', ㅗㅐ: 'ㅙ', ㅗㅣ: 'ㅚ', ㅜㅓ: 'ㅝ', ㅜㅔ: 'ㅞ', ㅜㅣ: 'ㅟ', ㅡㅣ: 'ㅢ' };
const COMPOUND_FINALS = { ㄱㅅ: 'ㄳ', ㄴㅈ: 'ㄵ', ㄴㅎ: 'ㄶ', ㄹㄱ: 'ㄺ', ㄹㅁ: 'ㄻ', ㄹㅂ: 'ㄼ', ㄹㅅ: 'ㄽ', ㄹㅌ: 'ㄾ', ㄹㅍ: 'ㄿ', ㄹㅎ: 'ㅀ', ㅂㅅ: 'ㅄ' };

const isVowel = (jamo) => JUNG_LIST.includes(jamo);
const isConsonant = (jamo) => CHO_LIST.includes(jamo);
const canBeFinal = (jamo) => JONG_LIST.includes(jamo);

const composeSyllable = (cho, jung, jong) =>
  String.fromCharCode(
    HANGUL_START + (CHO_LIST.indexOf(cho) * JUNG_COUNT + JUNG_LIST.indexOf(jung)) * JONG_COUNT + JONG_LIST.indexOf(jong),
  );

// "qhwmdrma" → "보증금". 영문자로만 된 말이 아니거나, 바꿨을 때 음절로 다 묶이지 않으면(자음·모음이 홀로 남으면 — "hug"→"ㅗㅕㅎ") null.
// 모두 대문자면 Caps Lock이 켜진 것으로 보고 소문자로 친다("QHWMDRMA"도 "보증금").
export const latinToHangul = (word) => {
  if (!/^[A-Za-z]+$/.test(word)) return null;
  const keys = word === word.toUpperCase() ? word.toLowerCase() : word;
  const jamos = [...keys].map((key) => KEYBOARD[key] ?? KEYBOARD[key.toLowerCase()]);
  // 자음 뒤에 모음이 오면 그 자음은 다음 음절의 초성이다("보증" — ㅂㅗ|ㅈㅡㅇ, ㅈ은 "봊"의 받침이 아님).
  const startsSyllable = (index) => isConsonant(jamos[index]) && isVowel(jamos[index + 1]);

  let result = '';
  let i = 0;
  while (i < jamos.length) {
    if (!startsSyllable(i)) return null;
    const cho = jamos[i];
    let jung = jamos[i + 1];
    i += 2;
    if (COMPOUND_VOWELS[jung + jamos[i]]) {
      jung = COMPOUND_VOWELS[jung + jamos[i]];
      i += 1;
    }
    let jong = '';
    if (canBeFinal(jamos[i]) && !startsSyllable(i)) {
      jong = jamos[i];
      i += 1;
      const compound = COMPOUND_FINALS[jong + jamos[i]];
      if (compound && !startsSyllable(i)) {
        jong = compound;
        i += 1;
      }
    }
    result += composeSyllable(cho, jung, jong);
  }
  return result;
};

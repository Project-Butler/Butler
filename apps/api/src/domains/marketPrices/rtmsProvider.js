// 국토교통부 실거래가 API 받기 · 읽기. **외부 호출은 이 파일에서만**(CLAUDE.md 3절 5번, 시세 계획서 1절).
// 요청 경로(사용자가 시세를 볼 때)에서는 부르지 않는다 — 정기 실행(cron)과 로컬 확인 도구만 부른다.
// 키(DATA_GO_KR_SERVICE_KEY)는 정리한 뒤(normalizeServiceKey) 요청 주소에만 넣고, 주소 · 키를 오류 메시지 · 로그에 남기지 않는다.
// 밖으로 내보내는 것은 키 모양(serviceKeyShape — 길이 · 참/거짓)뿐이다.
// XML 은 라이브러리 없이 읽는다(뉴스 RSS 와 같은 방식). 칸 이름은 활용 가이드 PDF(docs-b/rtms/) 기준.

import {
  MANWON,
  MAX_PAGES,
  MAX_RESPONSE_BYTES,
  NEXT_PAGE_NEEDS_MS,
  PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
  RESULT_NO_DATA,
  RESULT_OK,
  RETRY_CODES,
  RETRY_DELAY_MS,
  RETRY_LIMIT,
  RTMS_ENDPOINTS,
  isCancelledTrade,
  rentDealType,
} from './marketPriceRules.js';

// 실패는 이 오류 하나로 — code 는 원천 결과 코드(예: "30" 등록되지 않은 키) 또는 HTTP · TIMEOUT · NETWORK · TOO_LARGE · NO_KEY.
// fetchRtmsMonth 가 던질 때는 calls(다시 시도까지 실제로 부른 횟수)가 붙는다.
// 메시지에는 종류 · 시군구 · 계약월 · 코드만 담는다(요청 주소에 키가 있어서 주소는 담지 않는다)
export class RtmsError extends Error {
  constructor(code, detail, { kind, sigunguCode, yearMonth } = {}) {
    super(`실거래가 받기 실패 ${kind ?? ''} ${sigunguCode ?? ''} ${yearMonth ?? ''} — ${code}${detail ? ` ${detail}` : ''}`.replace(/\s+/g, ' ').trim());
    this.name = 'RtmsError';
    this.code = code;
  }
}

// 미룸(#272, 규칙 파일 NEXT_PAGE_NEEDS_MS) — 둘째 쪽부터 부르기 전에 요청 하나 몫이 안 남았을 때. 실패가 아니다(code 가 없다):
// 부르는 쪽(service/collect.js)은 이 묶음에 아무것도 쓰지 않고 다음 실행으로 넘긴다. fetchRtmsMonth 가 던질 때 calls 가 붙는다
export class RtmsDeferred extends Error {
  constructor({ kind, sigunguCode, yearMonth } = {}) {
    super(`실거래가 다음 쪽 미룸(시간 모자람) ${kind ?? ''} ${sigunguCode ?? ''} ${yearMonth ?? ''}`.replace(/\s+/g, ' ').trim());
    this.name = 'RtmsDeferred';
    this.deferred = true;
  }
}

// ===== XML 읽기(라이브러리 없음) =====

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
const readText = (raw) => {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return (cdata ? cdata[1] : decodeEntities(raw)).trim();
};
const tagText = (xml, tag) => {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? readText(match[1]) : '';
};

// <item> 하나의 칸들. 칸 이름은 **소문자로** 모은다 — 매매는 roadNmSggCd, 전월세는 roadnmsggcd 처럼 같은 칸의
// 대소문자가 달라서(가이드 2절), 소문자 하나로 읽으면 두 API 를 같은 코드로 읽는다. 빈 칸(" ")은 '' 이 된다
const readItemFields = (itemXml) => {
  const fields = {};
  for (const match of itemXml.matchAll(/<([A-Za-z][\w]*)>([\s\S]*?)<\/\1>/g)) fields[match[1].toLowerCase()] = readText(match[2]);
  return fields;
};

// 응답 한 페이지. 정상 봉투(<response><header>…)와 게이트웨이 오류 봉투(<OpenAPI_ServiceResponse>…returnReasonCode)를 모두 읽는다
export const parseRtmsXml = (xml) => {
  if (!/<response[\s>]/.test(xml)) {
    const code = tagText(xml, 'returnReasonCode') || tagText(xml, 'resultCode');
    return { resultCode: code || 'UNKNOWN', resultMsg: tagText(xml, 'returnAuthMsg') || tagText(xml, 'errMsg') || tagText(xml, 'resultMsg'), totalCount: 0, items: [] };
  }
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => readItemFields(match[1]));
  return {
    resultCode: tagText(xml, 'resultCode'),
    resultMsg: tagText(xml, 'resultMsg'),
    totalCount: Number(tagText(xml, 'totalCount')) || 0,
    items,
  };
};

// ===== 원천 칸 → 거래 한 건 =====

// "12,000" → 12000, "" → null. 숫자가 아니면 null
export const toNumber = (text) => {
  if (text === undefined || text === null) return null;
  const cleaned = String(text).replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};
const toInt = (text) => {
  const value = toNumber(text);
  return value === null ? null : Math.trunc(value);
};
const manwonToWon = (text) => {
  const value = toNumber(text);
  return value === null ? null : Math.round(value * MANWON);
};
const pad2 = (value) => String(value).padStart(2, '0');
const blankToNull = (text) => (text ? text : null);

// 가이드의 칸 → 우리 칸. kind 는 'TRADE'(매매) · 'RENT'(전월세). 잇기에 쓰는 위치 칸은 원문 그대로 둔다(linkComplex.js 가 읽음)
export const normalizeItem = (kind, fields) => {
  const year = toInt(fields.dealyear);
  const month = toInt(fields.dealmonth);
  const day = toInt(fields.dealday);
  const base = {
    sigunguCode: blankToNull(fields.sggcd),
    umdCode: blankToNull(fields.umdcd), // 매매만(전월세에는 없음)
    umdName: blankToNull(fields.umdnm),
    landCode: blankToNull(fields.landcd), // 매매만. "1" 대지 · "2" 산
    mainLotText: blankToNull(fields.bonbun), // 매매만
    subLotText: blankToNull(fields.bubun), // 매매만
    jibun: blankToNull(fields.jibun),
    road: {
      sigunguCode: blankToNull(fields.roadnmsggcd),
      roadCode: blankToNull(fields.roadnmcd),
      undergroundCode: blankToNull(fields.roadnmbcd),
      mainNoText: blankToNull(fields.roadnmbonbun),
      subNoText: blankToNull(fields.roadnmbubun),
    },
    aptSeq: blankToNull(fields.aptseq),
    aptName: blankToNull(fields.aptnm),
    exclusiveArea: toNumber(fields.excluusear),
    floor: toInt(fields.floor),
    contractDate: year && month && day ? `${year}-${pad2(month)}-${pad2(day)}` : null,
  };
  if (kind === 'TRADE') {
    return {
      ...base,
      dealType: 'SALE',
      price: manwonToWon(fields.dealamount),
      deposit: null,
      monthlyRent: null,
      contractType: null,
      cancelled: isCancelledTrade({ cdealType: fields.cdealtype }),
    };
  }
  const monthlyRentManwon = toNumber(fields.monthlyrent) ?? 0;
  return {
    ...base,
    dealType: rentDealType(monthlyRentManwon),
    price: null,
    deposit: manwonToWon(fields.deposit),
    monthlyRent: monthlyRentManwon > 0 ? manwonToWon(fields.monthlyrent) : null,
    contractType: blankToNull(fields.contracttype),
    cancelled: false,
  };
};

// ===== 서비스 키 정리 · 모양(규칙 · 이유: marketPriceRules.js "서비스 키") =====

const QUOTES = ['"', "'"];
// 정리 단계를 차례로 밟고, 무엇을 지웠는지도 함께 돌려준다(키 모양용). 정리한 키 글자는 이 파일 밖으로 내보내지 않는다(요청 주소에만)
const cleanServiceKey = (raw) => {
  const original = String(raw ?? '');
  // 앞뒤 공백 · 탭 · 줄바꿈(\r \n) · BOM(\uFEFF) — String.prototype.trim 이 모두 지운다
  let key = original.trim();
  let hadWhitespace = key !== original;
  let hadQuotes = false;
  if (key.length >= 2 && QUOTES.includes(key[0]) && key.at(-1) === key[0]) {
    hadQuotes = true;
    const inner = key.slice(1, -1);
    key = inner.trim(); // 따옴표 안쪽의 공백 · 줄바꿈도
    if (key !== inner) hadWhitespace = true;
  }
  const hadPercent = key.includes('%');
  if (hadPercent) {
    try {
      key = decodeURIComponent(key);
    } catch {
      // 잘못된 % 모양이면 그대로 둔다(그대로 한 번 인코딩 — 원천이 30 으로 알려 준다)
    }
  }
  return { key, hadWhitespace, hadQuotes, hadPercent };
};

// 정리한 키(디코딩 키 = 원문). 디코딩 키 · 인코딩 키 · 공백/줄바꿈/따옴표/BOM 이 붙은 키가 모두 같은 값이 된다
export const normalizeServiceKey = (raw) => cleanServiceKey(raw).key;

// 키 모양 — 길이와 참/거짓만(키 글자 · 앞뒤 몇 글자 · 해시 없음). 키가 없으면 길이 0 · 모두 false.
// 시세 응답(service/prices.js) · 정기 실행 로그(controller.js)가 키 오류(30 · NO_KEY)일 때만 쓴다 — 외부 호출은 하지 않는 순수 함수
export const serviceKeyShape = (raw) => {
  const { key, hadWhitespace, hadQuotes, hadPercent } = cleanServiceKey(raw);
  return { rawLength: String(raw ?? '').length, cleanedLength: key.length, hadWhitespace, hadQuotes, hadPercent, cleanedIsHex: /^[0-9a-f]+$/i.test(key) };
};

// ===== 받기 =====

const toDealYmd = (yearMonth) => yearMonth.replace('-', '');

// 요청 주소. 키는 정리한 원문(디코딩 키)을 한 번 인코딩해 넣는다. 이 주소는 어디에도 출력하지 않는다
const buildRequestUrl = ({ key, kind, sigunguCode, yearMonth, pageNo, numOfRows }) => {
  const params = new URLSearchParams({ LAWD_CD: sigunguCode, DEAL_YMD: toDealYmd(yearMonth), pageNo: String(pageNo), numOfRows: String(numOfRows) });
  return `${RTMS_ENDPOINTS[kind]}?serviceKey=${encodeURIComponent(key)}&${params}`;
};

// 받기 · 본문 읽기 오류 → RtmsError. 8초 신호가 끊은 것(헤더든 본문이든)은 TIMEOUT, 그 밖의 연결 오류는 NETWORK.
// 오류 메시지에 주소가 섞일 수 있어 이름만 남긴다. 11/18: 본문 읽기는 이 처리 밖에 있어서, 본문을 읽다 난 시간 초과가
// 그대로 새어 나가 DOMException 의 옛 코드 "23" 으로 적혔다(원천 결과 코드처럼 보였다)
const transportError = (error, where) => new RtmsError(error?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK', error?.name ?? 'Error', where);

// 한 페이지. 정상이면 { totalCount, items(원천 칸) }, 아니면 RtmsError. 다시 시도는 하지 않는다(fetchRtmsMonth 가 한다)
export const fetchRtmsPage = async ({ kind, sigunguCode, yearMonth, pageNo = 1, numOfRows = PAGE_SIZE }, { fetchImpl = globalThis.fetch } = {}) => {
  const where = { kind, sigunguCode, yearMonth };
  // 환경 변수가 없거나, 정리하니 비었으면(공백 · 따옴표뿐) 부르지 않는다
  const key = normalizeServiceKey(process.env.DATA_GO_KR_SERVICE_KEY);
  if (!key) throw new RtmsError('NO_KEY', 'DATA_GO_KR_SERVICE_KEY 없음', where);
  let response;
  try {
    response = await fetchImpl(buildRequestUrl({ key, kind, sigunguCode, yearMonth, pageNo, numOfRows }), {
      headers: { Accept: 'application/xml' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw transportError(error, where);
  }
  if (Number(response.headers?.get?.('content-length')) > MAX_RESPONSE_BYTES) throw new RtmsError('TOO_LARGE', '', where);
  let xml;
  try {
    xml = await response.text();
  } catch (error) {
    throw transportError(error, where);
  }
  if (xml.length > MAX_RESPONSE_BYTES) throw new RtmsError('TOO_LARGE', '', where);
  const page = parseRtmsXml(xml);
  if (!response.ok && page.resultCode === 'UNKNOWN') throw new RtmsError(`HTTP_${response.status}`, '', where);
  if (page.resultCode === RESULT_NO_DATA) return { totalCount: 0, items: [] };
  if (page.resultCode !== RESULT_OK) throw new RtmsError(page.resultCode, page.resultMsg, where);
  return { totalCount: page.totalCount, items: page.items };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 한 페이지 + 다시 시도. RETRY_CODES(시간 초과 · 23)일 때만 RETRY_DELAY_MS 쉬고 RETRY_LIMIT 번 더 — 그 밖의 오류는 바로 던진다.
// deadline(밀리초 시각)을 주면 "쉬기 + 요청 하나" 가 그 안에 들어갈 때만 다시 한다(실행 시간 한도를 넘기지 않게)
const fetchPageWithRetry = async (params, { fetchImpl, sleep, now, deadline }) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchRtmsPage(params, { fetchImpl });
    } catch (error) {
      const retryable = error instanceof RtmsError && RETRY_CODES.includes(error.code);
      if (!retryable || attempt >= RETRY_LIMIT || now() + RETRY_DELAY_MS + REQUEST_TIMEOUT_MS > deadline) throw error;
      await sleep(RETRY_DELAY_MS);
    }
  }
};

// 한 묶음(시군구 · 계약월 · 종류) 전부. totalCount 를 넘을 때까지 다음 페이지. 거래로 바꿔 돌려준다(해제 표시 포함 — 거르는 것은 부르는 쪽).
// calls = 원천을 실제로 부른 횟수(다시 시도 포함). 실패하면 그 수를 오류의 calls 에 붙여 던진다.
// sleep · now · deadline 은 다시 시도 · 다음 쪽용(테스트가 바꾼다). deadline 이 없으면 시간 한도 없이 한 번 더 하고 끝까지 넘긴다.
// 둘째 쪽부터는 요청 하나 몫(NEXT_PAGE_NEEDS_MS)이 남았을 때만 부르고, 모자라면 RtmsDeferred 를 던진다(#272 — 받은 쪽은 버린다).
// 첫 쪽은 보지 않는다 — 부르는 쪽이 묶음을 시작할 때 같은 조건으로 본다
export const fetchRtmsMonth = async (
  { kind, sigunguCode, yearMonth },
  { fetchImpl = globalThis.fetch, pageSize = PAGE_SIZE, sleep = wait, now = Date.now, deadline = Number.POSITIVE_INFINITY } = {},
) => {
  let calls = 0;
  const countedFetch = (...args) => {
    calls += 1;
    return fetchImpl(...args);
  };
  const fields = [];
  let totalCount = 0;
  try {
    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
      if (pageNo > 1 && now() + NEXT_PAGE_NEEDS_MS > deadline) throw new RtmsDeferred({ kind, sigunguCode, yearMonth });
      const page = await fetchPageWithRetry({ kind, sigunguCode, yearMonth, pageNo, numOfRows: pageSize }, { fetchImpl: countedFetch, sleep, now, deadline });
      totalCount = page.totalCount;
      fields.push(...page.items);
      if (page.items.length === 0 || fields.length >= totalCount) {
        return { deals: fields.map((item) => normalizeItem(kind, item)), calls, totalCount };
      }
    }
    throw new RtmsError('TOO_MANY_PAGES', `${MAX_PAGES}쪽 넘음`, { kind, sigunguCode, yearMonth });
  } catch (error) {
    if (error instanceof RtmsError || error instanceof RtmsDeferred) error.calls = calls;
    throw error;
  }
};

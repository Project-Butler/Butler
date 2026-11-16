// 국토교통부 실거래가 API 받기 · 읽기. **외부 호출은 이 파일에서만**(CLAUDE.md 3절 5번, 시세 계획서 1절).
// 요청 경로(사용자가 시세를 볼 때)에서는 부르지 않는다 — 정기 실행(cron)과 로컬 확인 도구만 부른다.
// 키(DATA_GO_KR_SERVICE_KEY)는 요청 주소에만 넣고, 주소 · 키를 오류 메시지 · 로그에 남기지 않는다.
// XML 은 라이브러리 없이 읽는다(뉴스 RSS 와 같은 방식). 칸 이름은 활용 가이드 PDF(docs-b/rtms/) 기준.

import {
  MANWON,
  MAX_PAGES,
  MAX_RESPONSE_BYTES,
  PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
  RESULT_NO_DATA,
  RESULT_OK,
  RTMS_ENDPOINTS,
  isCancelledTrade,
  rentDealType,
} from './marketPriceRules.js';

// 실패는 이 오류 하나로 — code 는 원천 결과 코드(예: "30" 등록되지 않은 키) 또는 HTTP · NETWORK · TOO_LARGE · NO_KEY.
// 메시지에는 종류 · 시군구 · 계약월 · 코드만 담는다(요청 주소에 키가 있어서 주소는 담지 않는다)
export class RtmsError extends Error {
  constructor(code, detail, { kind, sigunguCode, yearMonth } = {}) {
    super(`실거래가 받기 실패 ${kind ?? ''} ${sigunguCode ?? ''} ${yearMonth ?? ''} — ${code}${detail ? ` ${detail}` : ''}`.replace(/\s+/g, ' ').trim());
    this.name = 'RtmsError';
    this.code = code;
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

// ===== 받기 =====

const toDealYmd = (yearMonth) => yearMonth.replace('-', '');

// 요청 주소. 키는 Decoding 키(원문)를 한 번 인코딩해 넣는다. 이 주소는 어디에도 출력하지 않는다
const buildRequestUrl = ({ kind, sigunguCode, yearMonth, pageNo, numOfRows }) => {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  const params = new URLSearchParams({ LAWD_CD: sigunguCode, DEAL_YMD: toDealYmd(yearMonth), pageNo: String(pageNo), numOfRows: String(numOfRows) });
  return `${RTMS_ENDPOINTS[kind]}?serviceKey=${encodeURIComponent(key)}&${params}`;
};

// 한 페이지. 정상이면 { totalCount, items(원천 칸) }, 아니면 RtmsError
export const fetchRtmsPage = async ({ kind, sigunguCode, yearMonth, pageNo = 1, numOfRows = PAGE_SIZE }, { fetchImpl = globalThis.fetch } = {}) => {
  const where = { kind, sigunguCode, yearMonth };
  if (!process.env.DATA_GO_KR_SERVICE_KEY) throw new RtmsError('NO_KEY', 'DATA_GO_KR_SERVICE_KEY 없음', where);
  let response;
  try {
    response = await fetchImpl(buildRequestUrl({ kind, sigunguCode, yearMonth, pageNo, numOfRows }), {
      headers: { Accept: 'application/xml' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // fetch 오류 메시지에 주소가 섞일 수 있어 이름만 남긴다
    throw new RtmsError('NETWORK', error?.name ?? 'Error', where);
  }
  if (Number(response.headers?.get?.('content-length')) > MAX_RESPONSE_BYTES) throw new RtmsError('TOO_LARGE', '', where);
  const xml = await response.text();
  if (xml.length > MAX_RESPONSE_BYTES) throw new RtmsError('TOO_LARGE', '', where);
  const page = parseRtmsXml(xml);
  if (!response.ok && page.resultCode === 'UNKNOWN') throw new RtmsError(`HTTP_${response.status}`, '', where);
  if (page.resultCode === RESULT_NO_DATA) return { totalCount: 0, items: [] };
  if (page.resultCode !== RESULT_OK) throw new RtmsError(page.resultCode, page.resultMsg, where);
  return { totalCount: page.totalCount, items: page.items };
};

// 한 묶음(시군구 · 계약월 · 종류) 전부. totalCount 를 넘을 때까지 다음 페이지. 거래로 바꿔 돌려준다(해제 표시 포함 — 거르는 것은 부르는 쪽)
export const fetchRtmsMonth = async ({ kind, sigunguCode, yearMonth }, { fetchImpl, pageSize = PAGE_SIZE } = {}) => {
  const fields = [];
  let calls = 0;
  let totalCount = 0;
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
    const page = await fetchRtmsPage({ kind, sigunguCode, yearMonth, pageNo, numOfRows: pageSize }, { fetchImpl });
    calls += 1;
    totalCount = page.totalCount;
    fields.push(...page.items);
    if (page.items.length === 0 || fields.length >= totalCount) {
      return { deals: fields.map((item) => normalizeItem(kind, item)), calls, totalCount };
    }
  }
  throw new RtmsError('TOO_MANY_PAGES', `${MAX_PAGES}쪽 넘음`, { kind, sigunguCode, yearMonth });
};

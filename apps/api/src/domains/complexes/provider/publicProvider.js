// 공공데이터 provider — 단지 검색은 행안부 도로명주소(juso) 하나만 부른다.
//
// sourceKey: juso 도로명주소에서 만든 결정적 키 `ROAD:<도로명코드12>-<지하0/1>-<건물본번>-<건물부번>`.
// 단지(Complex) = 도로명주소 하나. 별칭·K-apt 이름 맞추기로 정체성을 정하지 않는다.
//
// 보안: 호스트·경로는 아래 상수로만 정한다(SSRF 방지). 사용자 입력은 URLSearchParams 값으로만
// 들어간다. 실패는 ExternalServiceError(reason)로만 던진다 — reason에 URL·키·응답 원문을 넣지 않는다.
// 공통 호출 도구(fetchJson 등)는 publicApi.js.
import { parseDetailBuildingNames } from '../detailBuildingNames.js';
import { ExternalServiceError } from './ExternalServiceError.js';
import { rollUpLegalDongCode } from './pnu.js';
import { fetchJson } from './publicApi.js';

const JUSO_BASE_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';
const MAX_JUSO_ROWS = 50;
// juso는 요청 경로에서 부르므로 공용 제한(EXTERNAL_API_TIMEOUT_MS, K-apt cron용)보다 짧게 둔다.
const DEFAULT_JUSO_TIMEOUT_MS = 3000;

// 검색어 문제(빈 값·한 글자·숫자만·특수문자·SQL 예약어 등)는 오류가 아니라 결과 없음으로 본다.
// 그 밖의 코드(E0001 미승인 키, E0014 키 만료, -999 시스템 오류 등)는 503.
const JUSO_EMPTY_RESULT_CODES = ['E0005', 'E0006', 'E0008', 'E0009', 'E0010', 'E0011', 'E0012', 'E0013', 'E0015'];

const getJusoTimeoutMs = () => Number(process.env.JUSO_TIMEOUT_MS) || DEFAULT_JUSO_TIMEOUT_MS;

const trimOrNull = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
};

const searchJuso = async (keyword, countPerPage) => {
  // juso 금지 특수문자(% = > < [ ])는 호출하는 쪽(controller)에서 걷어낸다. 직접 호출할 때도 같은 값을 넘겨야 한다.
  const cleaned = String(keyword).trim();
  if (cleaned.length === 0) return [];

  const json = await fetchJson(
    'juso',
    JUSO_BASE_URL,
    {
      confmKey: process.env.JUSO_API_KEY,
      keyword: cleaned,
      currentPage: '1',
      countPerPage: String(countPerPage),
      resultType: 'json',
    },
    { timeoutMs: getJusoTimeoutMs() },
  );

  const errorCode = json?.results?.common?.errorCode;
  if (errorCode === '0') return json.results.juso ?? [];
  if (JUSO_EMPTY_RESULT_CODES.includes(errorCode)) return [];
  throw new ExternalServiceError(`juso errorCode ${errorCode ?? 'missing'}`);
};

const toNonNegativeInt = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

// juso 행 → ROAD 키. 도로명코드(rnMgtSn 12자리)·건물본번이 없으면 null.
export const toRoadSourceKey = (juso) => {
  const roadCode = String(juso?.rnMgtSn ?? '').trim();
  const mainNo = toNonNegativeInt(juso?.buldMnnm);
  const subNo = toNonNegativeInt(juso?.buldSlno ?? 0);
  if (!/^\d{12}$/.test(roadCode) || mainNo === null || mainNo <= 0 || subNo === null) return null;
  const underground = String(juso.udrtYn) === '1' ? 1 : 0;
  return `ROAD:${roadCode}-${underground}-${mainNo}-${subNo}`;
};

// 검색 저장본(address_search_results.payload)에 남길 juso 칸. 단지를 만드는 데 필요한 것만.
const PAYLOAD_FIELDS = [
  'roadAddr',
  'jibunAddr',
  'zipNo',
  'admCd',
  'rn',
  'rnMgtSn',
  'udrtYn',
  'buldMnnm',
  'buldSlno',
  'mtYn',
  'lnbrMnnm',
  'lnbrSlno',
  'bdMgtSn',
  'bdNm',
  'detBdNmList',
];

const toSearchPayload = (juso) =>
  Object.fromEntries(PAYLOAD_FIELDS.map((field) => [field, typeof juso[field] === 'string' ? juso[field] : null]));

// juso 결과를 거르지 않고 그대로(상가 포함), juso 순서대로. 같은 ROAD 키가 두 번 나오면 첫 번째만.
const searchComplexes = async (query, size) => {
  const rows = await searchJuso(query, Math.min(size, MAX_JUSO_ROWS));
  const seen = new Set();
  const items = [];
  for (const juso of rows) {
    const sourceKey = toRoadSourceKey(juso);
    if (!sourceKey || seen.has(sourceKey) || !/^\d{10}$/.test(String(juso.admCd ?? ''))) continue;
    seen.add(sourceKey);
    const roadAddress = trimOrNull(juso.roadAddrPart1) ?? trimOrNull(juso.roadAddr);
    items.push({
      sourceKey,
      name: trimOrNull(juso.bdNm) ?? roadAddress,
      jibunAddress: trimOrNull(juso.jibunAddr),
      roadAddress,
      legalDongCode: rollUpLegalDongCode(juso.admCd),
      zipCode: trimOrNull(juso.zipNo),
      officialBuildingName: trimOrNull(juso.bdNm),
      detailBuildingNames: parseDetailBuildingNames(juso.detBdNmList),
      // bdKdcd: 공동주택 여부(1 공동주택, 0 비공동주택)
      isApartment: String(juso.bdKdcd) === '1',
      buildingMgtNo: trimOrNull(juso.bdMgtSn),
      payload: toSearchPayload(juso),
    });
  }
  return items.slice(0, size);
};

export const publicProvider = { searchComplexes };

// 주간 cron 외부 API 상태 점검(cron/apiHealth.js)용: 캐시·재시도 없이 한 번씩만 부른다.
// 참고 데이터 갱신(공식 연계 cron)이 도로명 원문·공동주택 여부를 모를 때 건물 하나를 찾는 데 쓴다. juso 행 원본을 돌려준다.
export const jusoReferenceSearch = {
  searchJuso: (keyword) => searchJuso(keyword, 20),
};

export const healthProbes = {
  searchJuso: (keyword) => searchJuso(keyword, 5),
};

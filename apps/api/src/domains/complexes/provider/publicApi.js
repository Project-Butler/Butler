// 공공데이터 API 공통 호출 도구. publicProvider(요청 경로)와 kaptSync(주간 동기화)가 같이 쓴다.
//
// 보안: 호출하는 쪽이 호스트·경로를 상수로만 넘긴다(SSRF 방지). 사용자 입력은 URLSearchParams 값으로만
// 들어간다. data.go.kr 키는 Decoding 키라 URLSearchParams가 한 번만 인코딩한다.
// 실패는 ExternalServiceError(reason)로만 던진다 — reason에 URL·키·응답 원문을 넣지 않는다.
import { ExternalServiceError } from './ExternalServiceError.js';

// 건축물대장 API는 캐시되지 않은 첫 조회가 7초 넘게 걸리기도 한다. Vercel 함수 제한(10초)보다는 짧게 둔다.
const DEFAULT_TIMEOUT_MS = 8000;

// data.go.kr: '00' 정상, '03' 데이터 없음
const DATA_GO_KR_OK_CODES = ['00', '000'];
const DATA_GO_KR_NO_DATA_CODES = ['03'];

const getTimeoutMs = () => Number(process.env.EXTERNAL_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

export const fetchJson = async (label, baseUrl, params) => {
  const url = new URL(baseUrl);
  url.search = new URLSearchParams(params).toString();

  const response = await fetch(url, { signal: AbortSignal.timeout(getTimeoutMs()) });
  if (!response.ok) throw new ExternalServiceError(`${label} HTTP ${response.status}`);

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // 키 오류 등은 XML로 오기도 한다. 원문은 남기지 않는다.
    throw new ExternalServiceError(`${label} invalid JSON`);
  }
};

// data.go.kr 응답의 header.resultCode를 확인하고 body를 돌려준다. 데이터 없음이면 null.
export const readDataGoKrBody = (label, json) => {
  // 게이트웨이 오류(키 오류·한도 초과 '22'·일시 오류 '04' 등)는 response 대신 OpenAPI_ServiceResponse로 온다.
  const gatewayCode = json?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
  if (gatewayCode !== undefined) throw new ExternalServiceError(`${label} gateway ${gatewayCode}`);

  const resultCode = json?.response?.header?.resultCode;
  if (DATA_GO_KR_NO_DATA_CODES.includes(resultCode)) return null;
  if (!DATA_GO_KR_OK_CODES.includes(resultCode)) {
    throw new ExternalServiceError(`${label} resultCode ${resultCode ?? 'missing'}`);
  }
  return json.response.body ?? null;
};

// items가 배열 / { item: 배열 | 객체 } / '' 중 어느 모양으로 와도 배열로 맞춘다.
export const toItemArray = (items) => {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  const { item } = items;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

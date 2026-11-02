// 단지 외부 데이터 공급자(provider) 선택과 공통 에러 변환.
//
// provider 인터페이스(없으면 null):
// - searchComplexes(query, size) → [{ sourceKey, name, jibunAddress, roadAddress, legalDongCode, zipCode,
//     officialBuildingName, detailBuildingNames, isApartment, buildingMgtNo, payload }]
//     payload: 검색 저장본(address_caches)에 남길 juso 칸(응답에는 내보내지 않음)
import { AppError } from '../../../platform/AppError.js';
import { ExternalServiceError } from './ExternalServiceError.js';
import { publicProvider } from './publicProvider.js';

const UNAVAILABLE_MESSAGE = '주소 검색 서비스에 잠시 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';

// 단지 검색은 juso만 부르므로 juso 키만 본다(K-apt 키는 cron·참고 데이터 쪽에서 따로 검사).
const hasJusoKey = () => Boolean(process.env.JUSO_API_KEY);

// 모듈을 처음 불러올 때 한 번만 경고한다. 키 값은 출력하지 않는다.
if (!hasJusoKey()) {
  console.warn('[complexes] JUSO_API_KEY 없음 — 단지 검색이 503을 반환합니다');
}

const getComplexProvider = () => {
  if (!hasJusoKey()) throw new ExternalServiceError('JUSO_API_KEY missing');
  return publicProvider;
};

// 외부 호출 실패를 사유만 남기고 503으로 바꾼다. 원본 에러(fetch 실패 원인에 호스트·URL이
// 들어 있을 수 있음)는 errorHandler까지 보내지 않는다.
const toUnavailableReason = (error) => {
  if (error instanceof ExternalServiceError) return error.reason;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (error instanceof SyntaxError) return 'invalid JSON';
  // 우리 코드 버그(undefined 접근 등)의 TypeError까지 503으로 숨기지 않도록 fetch 실패만 본다.
  if (error instanceof TypeError && error.message === 'fetch failed') return 'network error';
  return null;
};

// fn에는 고른 provider가 넘어간다: callProvider((provider) => provider.searchComplexes(q, size))
export const callProvider = async (fn) => {
  try {
    return await fn(getComplexProvider());
  } catch (error) {
    const reason = toUnavailableReason(error);
    if (reason === null) throw error;

    console.error('[complexes] external unavailable', reason);
    throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, UNAVAILABLE_MESSAGE);
  }
};

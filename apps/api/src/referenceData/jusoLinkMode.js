// 공식 연계 모드(JUSO_LINK_MODE). 표에 쓰는 경로는 모드로만 열린다(기준점이 있어도 shadow면 쓰지 않음).
//   off    건물DB 일변동분(JUSO_DELTA)만 적용. 승인키(JUSO_LINK_API_KEY)가 없으면 항상 off
//   shadow JUSO_DELTA 적용 + 공식 연계는 계획만 해서 비교 기록(JUSO_LINK_SHADOW). 키가 있을 때 기본값
//   apply  공식 연계(JUSO_LINK)만 적용, JUSO_DELTA는 cron에서 돌지 않음. 바꾸기 전에 juso-link:cutover로 기준점을 심는다.
import { SOURCES } from './referenceImports.js';

export const JUSO_LINK_MODES = ['off', 'shadow', 'apply'];

export const getJusoLinkApiKey = (env = process.env) => env.JUSO_LINK_API_KEY?.trim() || null;

export const getJusoLinkMode = (env = process.env) => {
  if (!getJusoLinkApiKey(env)) return 'off';
  const mode = env.JUSO_LINK_MODE?.trim().toLowerCase();
  return JUSO_LINK_MODES.includes(mode) ? mode : 'shadow';
};

// 지금 커서가 의미 있는(표에 쓰는) 출처
export const activeJusoSource = (mode) => (mode === 'apply' ? SOURCES.JUSO_LINK : SOURCES.JUSO_DELTA);

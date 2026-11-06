// 화면 형태(surface): 'web'(사이드바 셸) | 'app'(상단 바 + 하단 탭 셸). docs/plan.md 2장.
//   휴대폰 UA이거나, 터치 기기((pointer: coarse))이면서 폭이 768px 미만이면 앱, 아니면 웹.
//   폭은 단독 기준이 아니다(PC에서 창을 줄여도 웹).
//   UA는 navigator.userAgentData.mobile 을 먼저 보고, 지원하지 않는 브라우저(Safari·Firefox)는 navigator.userAgent 의 휴대폰 단어로 본다.
// 페이지를 열 때 한 번 판단하고 어디에도 저장하지 않는다. 열어 둔 채 창 크기만 바꿔서는 바뀌지 않는다(입력 중인 폼 보호).
export const APP_MAX_WIDTH = 768;

// 휴대폰 기기 단어. 태블릿(Android UA에 Mobile 없음, iPad)은 일부러 넣지 않는다.
const PHONE_UA = /iPhone|iPod|Android.+Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini|webOS/i;

export const detectSurface = ({ userAgentData, userAgent = '', isCoarsePointer = false, width = Number.POSITIVE_INFINITY } = {}) => {
  const isPhone = typeof userAgentData?.mobile === 'boolean' ? userAgentData.mobile : PHONE_UA.test(userAgent);
  if (isPhone) return 'app';
  return isCoarsePointer && width < APP_MAX_WIDTH ? 'app' : 'web';
};

// ?surface=app|web 로 덮어쓴다. 개발 환경에서만 동작하고 배포 빌드(isDev=false)에서는 무시한다.
export const readSurfaceOverride = (search, isDev) => {
  if (!isDev) return null;
  const value = new URLSearchParams(search).get('surface');
  return value === 'app' || value === 'web' ? value : null;
};

// readEnv()는 판단에 필요한 값을 읽어 온다. 처음 부를 때 한 번만 읽고, 그 결과를 이 페이지가 열려 있는 동안 쓴다.
export const createGetSurface = (readEnv) => {
  let surface = null;
  return () => {
    if (surface === null) {
      const env = readEnv();
      surface = readSurfaceOverride(env.search, env.isDev) ?? detectSurface(env);
    }
    return surface;
  };
};

const readBrowserEnv = () => ({
  userAgentData: navigator.userAgentData,
  userAgent: navigator.userAgent,
  isCoarsePointer: window.matchMedia('(pointer: coarse)').matches,
  width: window.innerWidth,
  search: window.location.search,
  isDev: import.meta.env.DEV,
});

export const getSurface = createGetSurface(readBrowserEnv);

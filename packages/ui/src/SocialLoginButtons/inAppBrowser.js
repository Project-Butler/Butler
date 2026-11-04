// 앱 안에서 열린 브라우저(웹뷰)에서는 구글이 로그인을 막는다(403 disallowed_useragent). 카카오톡으로 받은 링크가 대표적이다.
// 카카오톡이면 외부 브라우저로 다시 여는 주소를 주고, 그 밖의 앱은 안내만 한다. 서버가 아니라 UA 문자열만 보고 판단한다.
const IN_APP_PATTERN = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps/i;

export const isInAppBrowser = (userAgent = '') => IN_APP_PATTERN.test(userAgent);

export const isKakaoTalkBrowser = (userAgent = '') => /KAKAOTALK/i.test(userAgent);

// 카카오톡이 지원하는 "외부 브라우저로 열기" 스킴.
export const kakaoOpenExternalUrl = (pageUrl) => `kakaotalk://web/openExternal?url=${encodeURIComponent(pageUrl)}`;

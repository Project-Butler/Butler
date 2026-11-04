// 구글·카카오로 시작하는 링크 두 개. 누르면 API가 제공자 로그인 화면으로 보내므로 버튼이 아니라 링크(<a>)다.
// hrefFor('google' | 'kakao')가 이동할 주소를 돌려준다. label은 구분선 문구("간편 로그인" 등).

import { isInAppBrowser, isKakaoTalkBrowser, kakaoOpenExternalUrl } from './inAppBrowser';

// 브랜드 가이드의 색을 그대로 쓴다(카카오 노랑 #FEE500 + 검정 글자, 구글은 흰 바탕 + 회색 테두리).
const PROVIDERS = [
  {
    key: 'google',
    text: '구글로 계속하기',
    className: 'border border-line bg-white text-ink hover:bg-surface-2',
    icon: (
      <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
        <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
      </svg>
    ),
  },
  {
    key: 'kakao',
    text: '카카오로 계속하기',
    className: 'bg-[#FEE500] text-[#191919] hover:brightness-95',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="#191919"
          d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.3 4.7 6.7l-1 3.7c-.1.3.3.6.6.4l4.4-2.9c.4 0 .9.1 1.3.1 5.5 0 10-3.5 10-7.8S17.5 3 12 3z"
        />
      </svg>
    ),
  },
];

// userAgent·pageUrl은 테스트용으로 바꿀 수 있고, 기본은 지금 브라우저의 값이다.
export const SocialLoginButtons = ({
  hrefFor,
  label = '간편 로그인',
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  pageUrl = typeof window === 'undefined' ? '' : window.location.href,
}) => (
  <div className="mt-5 flex flex-col gap-3">
    <div className="flex items-center gap-3 text-chip text-ink-3">
      <span className="h-px flex-1 bg-line" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
    {isInAppBrowser(userAgent) && (
      <p role="note" className="rounded-input bg-surface-2 px-3 py-2 text-chip text-ink-2">
        앱 안에서 연 화면에서는 구글 로그인이 막힐 수 있습니다. 크롬·사파리 같은 브라우저로 열어 주세요.
        {isKakaoTalkBrowser(userAgent) && (
          <>
            {' '}
            <a href={kakaoOpenExternalUrl(pageUrl)} className="font-semibold text-accent-strong hover:underline">
              브라우저로 열기
            </a>
          </>
        )}
      </p>
    )}
    {PROVIDERS.map(({ key, text, className, icon }) => (
      <a
        key={key}
        href={hrefFor(key)}
        className={`flex h-11 items-center justify-center gap-2 rounded-btn text-body font-semibold transition ${className}`}
      >
        {icon}
        {text}
      </a>
    ))}
  </div>
);

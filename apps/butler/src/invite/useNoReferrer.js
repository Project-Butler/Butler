import { useEffect } from 'react';

// 초대 화면에서는 주소의 토큰이 다른 사이트(파일 저장소·외부 링크)로 Referer 에 실려 나가지 않게
// <meta name="referrer" content="no-referrer"> 를 둔다. 화면을 떠나면 원래 값(없었으면 태그째)으로 되돌린다.
export const useNoReferrer = () => {
  useEffect(() => {
    let meta = document.head.querySelector('meta[name="referrer"]');
    const created = !meta;
    const previous = meta?.getAttribute('content') ?? null;
    if (created) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'referrer');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'no-referrer');
    return () => {
      if (created) meta.remove();
      else if (previous === null) meta.removeAttribute('content');
      else meta.setAttribute('content', previous);
    };
  }, []);
};

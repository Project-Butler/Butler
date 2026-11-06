import { useEffect, useState } from 'react';

const matches = (query) => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches);

// CSS 미디어 쿼리가 맞는지. 화면 폭에 따라 다른 동작(패널에 열기 vs 화면 이동)을 고를 때 쓴다.
export const useMediaQuery = (query) => {
  const [isMatch, setIsMatch] = useState(() => matches(query));

  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return undefined;
    const update = () => setIsMatch(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return isMatch;
};

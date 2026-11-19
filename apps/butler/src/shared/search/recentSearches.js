// 최근 검색어(이 브라우저에만, 사용자별). 토큰이 아니라 화면 편의용이라 localStorage 에 둔다.
// 저장소를 못 쓰는 환경(사생활 보호 창 등)에서는 조용히 빈 목록으로 동작한다.
const MAX_RECENT = 10;
const storageKey = (userId) => `butler:recent-searches:${userId ?? 'guest'}`;

export const readRecentSearches = (userId) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
};

const write = (userId, items) => {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(items));
  } catch {
    // 저장하지 못해도 검색은 된다
  }
  return items;
};

// 맨 앞에 넣고 같은 검색어는 한 번만 남긴다.
export const addRecentSearch = (userId, query) =>
  write(userId, [query, ...readRecentSearches(userId).filter((item) => item !== query)].slice(0, MAX_RECENT));

export const removeRecentSearch = (userId, query) => write(userId, readRecentSearches(userId).filter((item) => item !== query));

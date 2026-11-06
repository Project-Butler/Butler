// 커뮤니티에서 지금 보고 있는 건물(complexId). 서버에 사용자 설정을 저장하는 API 가 없어서
// 브라우저 localStorage 에 둔다 — 플랫폼에 생기면 그쪽으로 옮긴다.
// 저장된 값이 내 건물 목록에 없으면(인증 만료·건물 삭제 등) 목록의 첫 건물을 쓴다.
const STORAGE_KEY = 'butler.community.currentComplexId';

export const loadCurrentComplexId = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const saveCurrentComplexId = (complexId) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, complexId);
  } catch {
    // 저장이 막힌 브라우저(사생활 보호 모드 등)에서는 이번 화면에서만 유지된다.
  }
};

// buildings: GET /community/my-buildings 응답. 없으면 null.
export const pickCurrentBuilding = (buildings, complexId) =>
  buildings.find((building) => building.complexId === complexId) ?? buildings[0] ?? null;

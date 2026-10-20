// 순서대로 모드 임시 저장(sessionStorage). 키: butler:draft:<userId>:<view>:<complexId?>
// 토큰·쿠키 같은 인증 값은 저장하지 않는다 — 입력값과 고른 단지(complexId + 화면 주소 글자)만.
// 사생활 보호 모드 등에서 저장소가 막혀 있어도 화면이 깨지지 않도록 모두 try/catch.
const PREFIX = 'butler:draft:';

export const toDraftKey = (userId, view, complexId) => `${PREFIX}${userId}:${view}:${complexId ?? ''}`;

export const readDraft = (key) => {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const writeDraft = (key, value) => {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없으면 임시 저장 없이 진행한다.
  }
};

export const clearDraft = (key) => {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // 무시
  }
};

// 로그아웃 때 그 사용자의 임시 저장을 모두 지운다.
export const clearUserDrafts = (userId) => {
  try {
    const prefix = `${PREFIX}${userId}:`;
    const keys = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // 무시
  }
};

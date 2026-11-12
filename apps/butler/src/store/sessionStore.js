// 세션 상태(zustand). 지금 로그인한 사용자와, 권리자 인증이 유효한 법정동 코드를 한 곳에 둔다.
// 서버 데이터는 tanstack query, 세션만 여기. 401 처리도 clearSession 하나로 모은다.
// 액션 참조는 상태가 바뀌어도 변하지 않는다. 데이터 훅이 onUnauthorized 를 useEffect 의존성에 넣기 때문에,
// clearSession 참조가 바뀌면 요청이 무한 반복된다.
import { create } from 'zustand';
import { getMe, postLogout } from '@butler/api-client';

export const useSessionStore = create((set, get) => ({
  user: null,
  verifiedLegalDongCodes: [],
  // 처음 열 때 쿠키 세션(GET /auth/me)을 확인하는 동안 true. 이 동안은 로그인 화면도 보호 화면도 그리지 않는다.
  isRestoring: true,

  // 새로고침해도 로그인이 풀리지 않게 쿠키 세션으로 복원한다. 401 등 실패는 로그아웃 상태로 두고 화면 판단은 호출부 몫이다.
  restoreSession: async () => {
    try {
      const { user, verifiedLegalDongCodes } = await getMe();
      set({ user, verifiedLegalDongCodes: verifiedLegalDongCodes ?? [], isRestoring: false });
    } catch {
      set({ user: null, verifiedLegalDongCodes: [], isRestoring: false });
    }
  },

  login: ({ user, verifiedLegalDongCodes }) => set({ user, verifiedLegalDongCodes: verifiedLegalDongCodes ?? [], isRestoring: false }),

  // 서버 로그아웃 → onLoggedOut → 세션 삭제 순서. 다음 로그인이 이전 사용자가 보던 경로로 돌아가지 않게
  // onLoggedOut 에서 /login 으로 먼저 이동한 뒤 세션을 지운다(세션을 먼저 지우면 보던 경로가 from 으로 남는다).
  logout: async (onLoggedOut) => {
    await postLogout();
    onLoggedOut?.();
    get().clearSession();
  },

  clearSession: () => set({ user: null, verifiedLegalDongCodes: [], isRestoring: false }),

  // 인증 완료·만료가 바로 보이게 법정동 권한을 다시 읽는다. 실패해도 지금 화면을 막지 않는다.
  refreshMe: async () => {
    try {
      const { verifiedLegalDongCodes } = await getMe();
      // 읽는 사이 로그아웃됐으면 반영하지 않는다(user 가 없는데 코드만 남는 상태를 만들지 않는다).
      if (get().user) set({ verifiedLegalDongCodes: verifiedLegalDongCodes ?? [] });
    } catch {
      /* 현재 화면을 막지 않는다 */
    }
  },
}));

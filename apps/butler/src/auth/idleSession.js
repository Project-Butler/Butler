// 세션 수명 규칙(#247). 쿠키만으로는 "창을 닫았다 다시 들어옴"과 "방치"를 구분하지 못해서 클라이언트가 보탠다.
//  - 30분 동안 아무 조작이 없으면 로그아웃한다. 마지막 조작 시각을 localStorage 로 공유해 탭 하나에서 조작하면 모든 탭이 산다.
//  - 열려 있는 탭이 하나라도 있으면(heartbeat) 새 탭도 로그인 상태로 이어가고, 하나도 없으면(= 창을 모두 닫았다 옴) 로그인부터 시작한다.
//  - 한 탭의 로그인·로그아웃은 BroadcastChannel 로 다른 탭에 알린다.
// 이 규칙은 편의·방치 방어이고, 실제 인증은 서버 JWT·세션 쿠키가 지킨다.
import { useEffect, useRef } from 'react';
import { postLogout } from '@butler/api-client';

export const IDLE_LIMIT_MS = 30 * 60 * 1000;
export const HEARTBEAT_MS = 5 * 1000;
export const ALIVE_WINDOW_MS = 15 * 1000;
export const ACTIVE_KEY = 'butler.lastActiveAt'; // 마지막 조작 시각(ms)
export const ALIVE_KEY = 'butler.tabAliveAt'; // 열린 탭이 5초마다 갱신하는 시각(ms)
export const TAB_KEY = 'butler.tabSeen'; // sessionStorage: 이 탭이 앱을 연 적이 있음. 탭을 닫으면 사라지고, 새로고침·다른 사이트에 갔다 오기에는 남는다
export const CHANNEL_NAME = 'butler-session';

const CHECK_INTERVAL_MS = 30 * 1000;
const REMOTE_ECHO_WINDOW_MS = 5 * 1000;
const ACTIVITY_THROTTLE_MS = 5 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];

// 저장소를 못 써도(사생활 보호 모드 등) 화면은 동작해야 한다.
const readTime = (key) => {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};
const writeTime = (key) => {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* 저장소를 못 쓰면 이 규칙만 약해진다 */
  }
};
const clearTime = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 위와 같다 */
  }
};
const hasTabMark = () => {
  try {
    return sessionStorage.getItem(TAB_KEY) !== null;
  } catch {
    return true; // 표식을 못 쓰면 새 방문으로 단정하지 않는다(로그인을 끊는 쪽이 더 나쁘다)
  }
};
const setTabMark = () => {
  try {
    sessionStorage.setItem(TAB_KEY, '1');
  } catch {
    /* 위와 같다 */
  }
};

let preparing = null;

// 앱을 열 때 한 번(페이지 로드당 한 번만: 개발 모드에서 effect 가 두 번 돌아도 같은 결과를 돌려준다).
// 남아 있는 쿠키 세션을 서버에서 끊는 경우는 둘이다. 이어지는 restoreSession(GET /auth/me)이 401을 받아 로그인 화면으로 간다.
//  - 창을 모두 닫았다 다시 옴: 열린 탭이 없고(heartbeat 가 15초 넘게 끊김) 이 탭도 처음이다(탭 표식 없음).
//    같은 탭의 새로고침이나 소셜 로그인 갔다 오기는 표식이 남아 있어 해당하지 않는다(방금 만든 세션을 끊으면 안 된다).
//  - 마지막 조작이 30분 넘게 지남(브라우저가 탭을 복원한 경우 등)
// 끝난 뒤에만 restoreSession 을 불러야 한다.
export const prepareSession = () => {
  preparing ??= (async () => {
    const now = Date.now();
    const noOpenTab = now - readTime(ALIVE_KEY) >= ALIVE_WINDOW_MS;
    const freshBrowsing = noOpenTab && !hasTabMark();
    // 새로 시작한 브라우징이면 지난 방문의 마지막 조작 시각은 의미가 없다(오늘의 새 로그인을 옛 시각으로 끊지 않는다).
    if (freshBrowsing) clearTime(ACTIVE_KEY);
    const lastActive = readTime(ACTIVE_KEY);
    const idle = lastActive > 0 && now - lastActive >= IDLE_LIMIT_MS;
    writeTime(ALIVE_KEY); // 이 탭도 열린 탭이다. 동시에 열린 다른 탭이 이 탭을 보고 로그아웃시키지 않게 판단 직후 바로 쓴다.
    setTabMark();

    if (!freshBrowsing && !idle) return;
    try {
      await postLogout();
    } catch {
      /* 서버 로그아웃이 실패해도 뒤따르는 세션 확인이 판단한다 */
    }
  })();
  return preparing;
};

// 이 탭이 열려 있음을 5초마다 알린다. 탭을 닫으면 갱신이 멈춰 15초 뒤 "열린 탭 없음"이 된다.
export const useTabHeartbeat = () => {
  useEffect(() => {
    writeTime(ALIVE_KEY);
    const timer = setInterval(() => writeTime(ALIVE_KEY), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);
};

// 로그인 중에 30분 동안 아무 조작이 없으면 onIdle(로그아웃)을 부른다. onIdle 이 Promise 를 돌려주면 끝날 때까지 기다리고,
// 끝난 뒤에도 로그인 중이면(실패) 다음 점검에 다시 부른다.
export const useIdleLogout = (isLoggedIn, onIdle) => {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    writeTime(ACTIVE_KEY);

    let lastWrite = Date.now();
    const onActivity = () => {
      if (Date.now() - lastWrite < ACTIVITY_THROTTLE_MS) return;
      lastWrite = Date.now();
      writeTime(ACTIVE_KEY);
    };
    let pending = false; // onIdle(서버 로그아웃) 응답을 기다리는 동안 점검이 또 와도 다시 부르지 않는다
    const check = () => {
      if (pending) return;
      const lastActive = readTime(ACTIVE_KEY) || Date.now();
      if (Date.now() - lastActive < IDLE_LIMIT_MS) return;
      const result = onIdleRef.current();
      if (typeof result?.finally === 'function') {
        pending = true;
        result.finally(() => { pending = false; });
      }
    };
    // 백그라운드 탭은 타이머가 느려지므로, 다시 보이는 순간에도 바로 점검한다.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    const timer = setInterval(check, CHECK_INTERVAL_MS);
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }));
      document.removeEventListener('visibilitychange', onVisible);
      clearTime(ACTIVE_KEY); // 로그아웃(또는 화면 종료): 지난 로그인의 조작 시각을 남기지 않는다
    };
  }, [isLoggedIn]);
};

// 로그인·로그아웃을 다른 탭과 맞춘다. 이 탭의 user 가 바뀌면 알리고, 다른 탭의 알림을 받으면 콜백을 부른다.
//  - 다른 탭이 로그아웃 → onRemoteLogout(이 탭도 로그인 화면으로)
//  - 다른 탭이 로그인 → 이 탭이 로그아웃 상태일 때만 onRemoteLogin(세션을 다시 읽어 홈으로)
// 알림을 받아서 생긴 변화는 다시 알리지 않는다(왕복 방지).
export const useSessionSync = (user, { onRemoteLogout, onRemoteLogin }) => {
  const isLoggedIn = Boolean(user);
  const isLoggedInRef = useRef(isLoggedIn);
  const channelRef = useRef(null);
  const remoteRef = useRef({ state: null, at: 0 }); // 다른 탭의 알림으로 곧 생길 변화(상태, 받은 시각)
  const handlersRef = useRef({ onRemoteLogout, onRemoteLogin });
  handlersRef.current = { onRemoteLogout, onRemoteLogin };

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = ({ data }) => {
      if (data === 'logout' && isLoggedInRef.current) {
        remoteRef.current = { state: false, at: Date.now() };
        handlersRef.current.onRemoteLogout();
      } else if (data === 'login' && !isLoggedInRef.current) {
        remoteRef.current = { state: true, at: Date.now() };
        handlersRef.current.onRemoteLogin();
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isLoggedInRef.current === isLoggedIn) return;
    isLoggedInRef.current = isLoggedIn;
    const remote = remoteRef.current;
    remoteRef.current = { state: null, at: 0 };
    // 알림을 받은 직후 같은 방향으로 바뀐 것만 건너뛴다. 세션 확인이 실패해 안 바뀐 알림이 나중 변화를 가리지 않게 시간도 본다.
    if (remote.state === isLoggedIn && Date.now() - remote.at < REMOTE_ECHO_WINDOW_MS) return;
    channelRef.current?.postMessage(isLoggedIn ? 'login' : 'logout');
  }, [isLoggedIn]);
};

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useOpenThread } from '../../../../shared/threads/useOpenThread';

// 임대인 PC 오른쪽 아래 대화 팝업 상태(docs/19 4장·11-3).
// - status: 'closed'(아무것도 없음, P4) · 'open'(팝업, P1·P2) · 'collapsed'(접힘 막대, P3)
// - view: 'list'(대화 목록) · 'thread'(대화 하나, threadId)
// 레이아웃(LayoutWithBadges) 안에 두어 화면을 옮겨도 그대로이고, 주소는 바꾸지 않는다.
// 같은 탭 새로고침에는 사용자별 sessionStorage 로 이어 간다(읽기·쓰기 실패하면 닫힌 채로 시작).
const CLOSED = { status: 'closed', view: 'list', threadId: null };
const STATUSES = new Set(['closed', 'open', 'collapsed']);

export const threadDockStorageKey = (userId) => `butler:landlord:threadDock:${userId}`;

const readSaved = (userId) => {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(threadDockStorageKey(userId)) ?? 'null');
    if (!saved || !STATUSES.has(saved.status)) return CLOSED;
    const view = saved.view === 'thread' && typeof saved.threadId === 'string' ? 'thread' : 'list';
    return { status: saved.status, view, threadId: view === 'thread' ? saved.threadId : null };
  } catch {
    return CLOSED;
  }
};

const writeSaved = (userId, state) => {
  try {
    if (state.status === 'closed') window.sessionStorage.removeItem(threadDockStorageKey(userId));
    else window.sessionStorage.setItem(threadDockStorageKey(userId), JSON.stringify(state));
  } catch {
    // 저장하지 못해도 화면은 그대로 쓴다.
  }
};

const ThreadDockContext = createContext(null);

// 팝업 상태와 동작. 레이아웃 밖(테스트에서 화면만 그릴 때 등)에서는 null 이라 대화 버튼을 숨긴다.
export const useThreadDock = () => useContext(ThreadDockContext);

export const ThreadDockProvider = ({ userId, onUnauthorized, onNavigate, children }) => {
  const [state, setState] = useState(() => readSaved(userId));
  const [openError, setOpenError] = useState(null);

  useEffect(() => {
    writeSaved(userId, state);
  }, [userId, state]);

  // 로그인이 풀리면 기억해 둔 팝업을 지우고 로그인 화면으로 보낸다.
  const handleUnauthorized = useCallback(() => {
    setState(CLOSED);
    onUnauthorized?.();
  }, [onUnauthorized]);

  const { openThread: postOpenThread, isLoading: isOpening } = useOpenThread({ onUnauthorized: handleUnauthorized });

  const openList = useCallback(() => setState({ status: 'open', view: 'list', threadId: null }), []);
  const openThread = useCallback((threadId) => setState({ status: 'open', view: 'thread', threadId }), []);
  const backToList = useCallback(() => setState((prev) => ({ ...prev, view: 'list', threadId: null })), []);
  const collapse = useCallback(() => setState((prev) => (prev.status === 'open' ? { ...prev, status: 'collapsed' } : prev)), []);
  const expand = useCallback(() => setState((prev) => (prev.status === 'collapsed' ? { ...prev, status: 'open' } : prev)), []);
  const close = useCallback(() => setState(CLOSED), []);

  // 계약·요청의 대화를 팝업으로 연다(POST /threads, 이미 있으면 그 대화). 이미 여는 중이면 아무것도 하지 않는다.
  // 422(임차인이 연결되지 않음 등)면 openError 를 두고 팝업은 그대로 둔다.
  const openContext = useCallback(
    async (contextType, contextId) => {
      setOpenError(null);
      const result = await postOpenThread(contextType, contextId);
      if (result.data) openThread(result.data.id);
      else if (result.error) setOpenError({ ...result.error, contextId });
      return result;
    },
    [postOpenThread, openThread],
  );

  const value = useMemo(
    () => ({
      ...state,
      userId,
      openList,
      openThread,
      openContext,
      isOpening,
      openError,
      backToList,
      collapse,
      expand,
      close,
      onNavigate,
      onUnauthorized: handleUnauthorized,
    }),
    [state, userId, openList, openThread, openContext, isOpening, openError, backToList, collapse, expand, close, onNavigate, handleUnauthorized],
  );

  return <ThreadDockContext.Provider value={value}>{children}</ThreadDockContext.Provider>;
};

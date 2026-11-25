import { useCallback, useEffect, useRef, useState } from 'react';

// 다운로드 주소는 5분만 쓸 수 있다. 4분이 지난 주소는 쓰기 전에 다시 받는다(동영상은 60분 주소라 load에 freshMs를 준다).
const FRESH_MS = 4 * 60 * 1000;

// 주소를 받는 동안 팝업 차단에 걸리지 않게, 누른 순간 빈 탭을 먼저 연다. 주소가 오면 그 탭을 옮긴다.
const openBlankTab = () => {
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  return win;
};
const moveTab = (win, url) => {
  if (win && !win.closed) win.location.href = url;
  else window.location.assign(url);
};

const saveFile = (url, fileName) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName ?? '';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

// 공유 문서의 서명 주소를 문서마다 받아 둔다. fetchUrl(documentId, { purpose }) → { url, expiresAt }
//   - 공개 초대 화면: postTenantInvitationDocumentDownloadUrl(token, id, opts) · 임차인 앱: postDocumentDownloadUrl(id, opts)
//   - load(id, { force, purpose, freshMs }): 없거나 오래된(freshMs, 기본 4분) 주소만 다시 받는다(열 때마다 새 주소). force 면 항상 새로.
//     purpose 'THUMBNAIL'(격자·미리 받기, 사진은 감사 안 함) | 'VIEW'(기본, 크게 본 것 — 감사).
//     VIEW로 받은 주소는 썸네일에도 쓰지만, THUMBNAIL로 받은 주소로는 VIEW를 대신하지 않는다(크게 볼 때 VIEW로 다시 받는다).
//   - open·save는 항상 VIEW로 새 주소를 받는다.
//   - reportError(id): 사진이 안 뜨면 한 번만 다시 받는다. 두 번째도 실패면 error 로 둔다.
// 주소는 화면 메모리에만 두고 저장소에 남기지 않는다.
export const useDocumentUrls = (fetchUrl) => {
  const [entries, setEntries] = useState({});
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const inflight = useRef(new Map());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const update = useCallback((id, patch) => {
    if (!mounted.current) return;
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const fetchFresh = useCallback(
    (id, purpose = 'VIEW') => {
      const key = `${id}:${purpose}`;
      if (inflight.current.has(key)) return inflight.current.get(key);
      update(id, { status: 'loading' });
      const promise = fetchUrl(id, { purpose })
        .then(({ url }) => {
          // 늦게 온 썸네일 주소가 이미 받은 VIEW 주소를 덮지 않게 한다.
          const current = entriesRef.current[id];
          if (purpose === 'THUMBNAIL' && current?.purpose === 'VIEW' && current.status === 'ready') return current.url;
          update(id, { url, status: 'ready', fetchedAt: Date.now(), purpose });
          return url;
        })
        .catch((error) => {
          update(id, { status: 'error' });
          throw error;
        })
        .finally(() => inflight.current.delete(key));
      inflight.current.set(key, promise);
      return promise;
    },
    [fetchUrl, update],
  );

  const load = useCallback(
    (id, { force = false, purpose = 'VIEW', freshMs = FRESH_MS } = {}) => {
      const entry = entriesRef.current[id];
      const isUsable = purpose === 'THUMBNAIL' || entry?.purpose === 'VIEW';
      const isFresh = entry?.status === 'ready' && Date.now() - entry.fetchedAt < freshMs && isUsable;
      if (!force && isFresh) return Promise.resolve(entry.url);
      if (!force && purpose === 'THUMBNAIL' && entry?.status === 'loading') return Promise.resolve(entry?.url ?? null);
      return fetchFresh(id, purpose).catch(() => null);
    },
    [fetchFresh],
  );

  const reportError = useCallback(
    (id) => {
      const entry = entriesRef.current[id];
      if (entry?.retried) {
        update(id, { status: 'error' });
        return;
      }
      update(id, { retried: true });
      fetchFresh(id, entry?.purpose ?? 'VIEW').catch(() => null);
    },
    [fetchFresh, update],
  );

  const retry = useCallback(
    (id) => {
      update(id, { retried: false });
      fetchFresh(id, entriesRef.current[id]?.purpose ?? 'VIEW').catch(() => null);
    },
    [fetchFresh, update],
  );

  // PDF 는 새 탭에서, 저장은 원본 내려받기. 둘 다 누른 순간 새 주소를 받는다.
  const open = useCallback(
    async (document) => {
      const win = openBlankTab();
      const url = await fetchFresh(document.id).catch(() => null);
      if (url) moveTab(win, url);
      else win?.close();
      return Boolean(url);
    },
    [fetchFresh],
  );

  const save = useCallback(
    async (document) => {
      const url = await fetchFresh(document.id).catch(() => null);
      if (url) saveFile(url, document.fileName);
      return Boolean(url);
    },
    [fetchFresh],
  );

  return { entries, load, reportError, retry, open, save };
};

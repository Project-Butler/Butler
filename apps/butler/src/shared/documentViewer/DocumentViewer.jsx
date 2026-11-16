import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Minimize2, X } from 'lucide-react';
import { formatBytes, getFileBadge, isImageDocument } from './documentFiles';
import {
  clampOffset,
  DOUBLE_TAP_SCALE,
  distance,
  fitInto,
  formatZoom,
  midpoint,
  MIN_SCALE,
  swipeTarget,
  visibleRect,
  zoomAt,
} from './viewerMath';

const BG = 'bg-[#0F1714]';
const TOOL_BUTTON = 'flex h-11 items-center justify-center gap-1.5 rounded-btn bg-white/10 text-btn-sm font-semibold text-white hover:bg-white/15 disabled:opacity-40';
const ROUND_BUTTON = 'flex h-11 w-11 items-center justify-center rounded-full text-white';
const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 10;
const RESET_VIEW = { scale: MIN_SCALE, offset: { x: 0, y: 0 } };
const MINI_MAP_BOX = { width: 60, height: 80 };

// 무대 크기. ResizeObserver 가 없는 환경(테스트)에서는 처음 잰 값을 쓴다.
const useElementSize = (ref) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
};

// 사진을 상자 안에 꽉 차게 그리는 스타일(가운데 기준).
const fittedImageStyle = (natural, fit) => ({
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: natural.width * fit.ratio,
  height: natural.height * fit.ratio,
  maxWidth: 'none',
  transform: 'translate(-50%, -50%)',
});

const PdfSlide = ({ document, onOpen }) => (
  <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-white">
    <span className="flex h-24 w-[72px] items-center justify-center rounded border border-white/30 bg-crit-box font-num text-sub font-bold text-crit-ink">
      {getFileBadge(document)}
    </span>
    <div className="min-w-0">
      <p className="break-all text-body font-semibold">{document.fileName}</p>
      <p className="mt-0.5 font-num text-m-sub text-white/60">{formatBytes(document.sizeBytes)}</p>
    </div>
    <button type="button" onClick={() => onOpen(document)} className={`${TOOL_BUTTON} px-5`}>
      <ExternalLink size={16} strokeWidth={1.8} aria-hidden="true" />
      새 탭에서 열기
    </button>
  </div>
);

// 사진 크게 보기(시안 B4) · 확대한 상태(B5). 공유된 파일 전체를 한 줄로 넘긴다(옆으로 밀기 · 화살표 · 아래 썸네일).
//   - 두 손가락 벌리기 · 두 번 누르기 · (PC) 휠로 확대, 확대하면 끌어서 옮기고 오른쪽 위 작은 지도와 배율 칩을 보여 준다.
//   - [저장]은 그때 받은 새 주소로 원본을 내려받는다. 돌리기는 두지 않는다.
//   - PDF 칸·썸네일은 새 탭에서 PDF 를 연다. 자동 보정·글자 판독은 하지 않는다.
// documents: [{ id, fileName, mimeType, sizeBytes }], urls: useDocumentUrls 의 결과.
export const DocumentViewer = ({ documents, startIndex = 0, urls, onClose }) => {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), documents.length - 1));
  const [view, setView] = useState(RESET_VIEW);
  const [naturals, setNaturals] = useState({});
  const [swipeDx, setSwipeDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [saveError, setSaveError] = useState('');
  const stageRef = useRef(null);
  const closeRef = useRef(null);
  const gesture = useRef({ pointers: new Map(), mode: null, lastTap: null });
  const stage = useElementSize(stageRef);
  const viewRef = useRef(view);
  viewRef.current = view;

  const current = documents[index];
  const isImage = isImageDocument(current);
  const natural = naturals[current?.id];
  const content = useMemo(() => (natural ? fitInto(natural, stage) : { ratio: 1, width: 0, height: 0 }), [natural, stage]);
  const isZoomed = view.scale > MIN_SCALE;
  const entry = urls.entries[current?.id];
  const { load } = urls;

  // 지금 칸과 양옆 사진의 주소를 받는다(오래된 주소는 새로).
  useEffect(() => {
    [index - 1, index, index + 1].forEach((position) => {
      const document = documents[position];
      if (document && isImageDocument(document)) load(document.id);
    });
  }, [documents, index, load]);

  // 열려 있는 동안 뒤 화면이 스크롤되지 않게 하고, 닫으면 원래대로.
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const goTo = useCallback(
    (next) => {
      const target = Math.min(documents.length - 1, Math.max(0, next));
      setIndex(target);
      setView(RESET_VIEW);
      setSaveError('');
    },
    [documents.length],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft') goTo(index - 1);
      else if (event.key === 'ArrowRight') goTo(index + 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goTo, index, onClose]);

  const toStagePoint = useCallback((clientX, clientY) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }, []);

  // PC 휠 확대. passive 가 아니어야 페이지 스크롤을 막을 수 있어서 직접 붙인다.
  useEffect(() => {
    const element = stageRef.current;
    if (!element || !isImage || !natural) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const point = toStagePoint(event.clientX, event.clientY);
      setView((prev) => zoomAt(prev, prev.scale * Math.exp(-event.deltaY * 0.0015), point, stage, content));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [content, isImage, natural, stage, toStagePoint]);

  const handleTap = (point) => {
    const now = Date.now();
    const last = gesture.current.lastTap;
    if (last && now - last.time < DOUBLE_TAP_MS && distance(last.point, point) < 30) {
      gesture.current.lastTap = null;
      setView((prev) => (prev.scale > MIN_SCALE ? RESET_VIEW : zoomAt(prev, DOUBLE_TAP_SCALE, point, stage, content)));
      return;
    }
    gesture.current.lastTap = { time: now, point };
  };

  const onPointerDown = (event) => {
    if (!isImage || !natural) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const g = gesture.current;
    const point = toStagePoint(event.clientX, event.clientY);
    g.pointers.set(event.pointerId, point);
    setIsDragging(true);
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      Object.assign(g, { mode: 'pinch', startDist: distance(a, b) || 1, startMid: midpoint(a, b), startView: view, moved: true });
      setSwipeDx(0);
    } else if (g.pointers.size === 1) {
      Object.assign(g, { mode: view.scale > MIN_SCALE ? 'pan' : 'swipe', start: point, startView: view, moved: false });
    }
  };

  const onPointerMove = (event) => {
    const g = gesture.current;
    if (!g.pointers.has(event.pointerId)) return;
    const point = toStagePoint(event.clientX, event.clientY);
    g.pointers.set(event.pointerId, point);
    if (g.mode === 'pinch' && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()];
      const mid = midpoint(a, b);
      const zoomed = zoomAt(g.startView, (g.startView.scale * distance(a, b)) / g.startDist, g.startMid, stage, content);
      const moved = { x: zoomed.offset.x + mid.x - g.startMid.x, y: zoomed.offset.y + mid.y - g.startMid.y };
      setView({ scale: zoomed.scale, offset: clampOffset(moved, zoomed.scale, stage, content) });
      return;
    }
    const dx = point.x - g.start.x;
    const dy = point.y - g.start.y;
    if (Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
    if (g.mode === 'pan') {
      const next = { x: g.startView.offset.x + dx, y: g.startView.offset.y + dy };
      setView({ scale: g.startView.scale, offset: clampOffset(next, g.startView.scale, stage, content) });
    } else if (g.mode === 'swipe') {
      setSwipeDx(dx);
    }
  };

  const onPointerUp = (event) => {
    const g = gesture.current;
    if (!g.pointers.has(event.pointerId)) return;
    const point = g.pointers.get(event.pointerId);
    g.pointers.delete(event.pointerId);
    if (g.mode === 'pinch') {
      if (g.pointers.size === 1) {
        // 한 손가락이 남으면 이어서 끌어 옮긴다.
        const [rest] = [...g.pointers.values()];
        const settled = viewRef.current.scale < 1.05 ? RESET_VIEW : viewRef.current;
        Object.assign(g, { mode: settled.scale > MIN_SCALE ? 'pan' : 'swipe', start: rest, startView: settled, moved: true });
        setView(settled);
      }
      if (g.pointers.size === 0) {
        g.mode = null;
        setIsDragging(false);
        if (viewRef.current.scale < 1.05) setView(RESET_VIEW);
      }
      return;
    }
    if (g.pointers.size > 0) return;
    setIsDragging(false);
    if (g.mode === 'swipe') {
      const dx = point.x - g.start.x;
      setSwipeDx(0);
      const target = swipeTarget(index, documents.length, dx);
      if (target !== index) goTo(target);
      else if (!g.moved) handleTap(point);
    } else if (g.mode === 'pan' && !g.moved) {
      handleTap(point);
    }
    g.mode = null;
  };

  const onPointerCancel = (event) => {
    const g = gesture.current;
    g.pointers.delete(event.pointerId);
    if (g.pointers.size === 0) {
      g.mode = null;
      setIsDragging(false);
      setSwipeDx(0);
    }
  };

  const save = async () => {
    setSaveError('');
    const ok = await urls.save(current);
    if (!ok) setSaveError('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  };

  const selectThumb = (position) => {
    const document = documents[position];
    goTo(position);
    if (!isImageDocument(document)) urls.open(document);
  };

  const onImageLoad = (event) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
    if (width && height) setNaturals((prev) => ({ ...prev, [current.id]: { width, height } }));
  };

  const miniFit = natural ? fitInto(natural, MINI_MAP_BOX) : null;
  const rect = visibleRect(view.scale, view.offset, stage, content);

  if (!current) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="계약서 크게 보기" className={`fixed inset-0 z-50 flex flex-col ${BG} font-sans text-white`}>
      <header className="mx-auto flex h-12 w-full max-w-[430px] shrink-0 items-center gap-2 px-1">
        <button ref={closeRef} type="button" aria-label="닫기" onClick={onClose} className={ROUND_BUTTON}>
          <X size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-body font-semibold">{current.fileName}</p>
        <p aria-live="polite" className="w-11 shrink-0 pr-3 text-right font-num text-num-body tabular-nums">
          {index + 1} / {documents.length}
        </p>
      </header>

      <div
        ref={stageRef}
        data-testid="viewer-stage"
        className="relative flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {isImage ? (
          entry?.status === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <p className="text-body text-white/80">사진을 불러오지 못했어요.</p>
              <button type="button" onClick={() => urls.retry(current.id)} className={`${TOOL_BUTTON} px-5`}>
                다시 시도
              </button>
            </div>
          ) : entry?.url ? (
            <div
              className="absolute inset-0"
              style={{
                transform: `translate(${view.offset.x + swipeDx}px, ${view.offset.y}px) scale(${view.scale})`,
                transition: isDragging ? 'none' : 'transform 180ms ease-out',
              }}
            >
              <img
                key={entry.url}
                src={entry.url}
                alt={current.fileName}
                draggable={false}
                onLoad={onImageLoad}
                onError={() => urls.reportError(current.id)}
                style={
                  natural && content.ratio
                    ? fittedImageStyle(natural, content)
                    : { position: 'absolute', left: '50%', top: '50%', maxWidth: '100%', maxHeight: '100%', transform: 'translate(-50%, -50%)', opacity: 0 }
                }
                className="pointer-events-none shadow-lg"
              />
            </div>
          ) : (
            <p role="status" className="flex h-full items-center justify-center text-body text-white/60">
              불러오는 중이에요
            </p>
          )
        ) : (
          <PdfSlide document={current} onOpen={urls.open} />
        )}

        {!isZoomed && index > 0 && (
          <button type="button" aria-label="이전 파일" onClick={() => goTo(index - 1)} className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-1.5 text-white">
            <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
        {!isZoomed && index < documents.length - 1 && (
          <button type="button" aria-label="다음 파일" onClick={() => goTo(index + 1)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-1.5 text-white">
            <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}

        {isZoomed && isImage && miniFit && entry?.url && (
          <div aria-hidden="true" className="absolute right-3 top-3 rounded border border-white/40 bg-white/20 p-1">
            <div className="relative overflow-hidden rounded-sm" style={{ width: miniFit.width, height: miniFit.height }}>
              <img src={entry.url} alt="" draggable={false} style={fittedImageStyle(natural, miniFit)} />
              <span
                className="absolute border-2 border-accent"
                style={{ left: `${rect.left * 100}%`, top: `${rect.top * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
              />
            </div>
          </div>
        )}
        {isZoomed && (
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 font-num text-num-sub tabular-nums text-white">
            {formatZoom(view.scale)}
          </span>
        )}
      </div>

      <div className="mx-auto w-full max-w-[430px] shrink-0">
        {(!isImage || isZoomed) && (
          <p className="py-2 text-center text-m-sub text-white/60">
            {!isImage ? 'PDF 는 새 탭에서 열려요' : '끌어서 옮기기 · 두 번 누르면 원래 크기'}
          </p>
        )}
        <div className="space-y-3 px-4 pb-4 pt-2">
          {!isZoomed && documents.length > 1 && (
            <ul aria-label="파일 목록" className="flex justify-center gap-1.5 overflow-x-auto">
              {documents.map((document, position) => {
                const thumbUrl = urls.entries[document.id]?.url;
                const active = position === index;
                return (
                  <li key={document.id} className="shrink-0">
                    <button
                      type="button"
                      aria-label={`${position + 1}번째 파일 ${document.fileName}`}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => selectThumb(position)}
                      className={`flex h-11 w-8 items-center justify-center overflow-hidden rounded ${active ? 'border-2 border-white' : 'border border-white/30'} ${isImageDocument(document) ? 'bg-surface-2' : 'bg-crit-box'}`}
                    >
                      {isImageDocument(document) ? (
                        thumbUrl && <img src={thumbUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                      ) : (
                        <span className="font-num text-[9px] font-bold text-crit-ink">{getFileBadge(document)}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {saveError && (
            <p role="alert" className="text-center text-m-sub text-[#F4B7AD]">
              {saveError}
            </p>
          )}
          <div className={`grid gap-2 ${isZoomed || !isImage ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {isZoomed ? (
              <button type="button" onClick={() => setView(RESET_VIEW)} className={TOOL_BUTTON}>
                <Minimize2 size={16} strokeWidth={1.8} aria-hidden="true" />
                원래 크기
              </button>
            ) : (
              !isImage && (
                <button type="button" onClick={() => urls.open(current)} className={TOOL_BUTTON}>
                  <ExternalLink size={16} strokeWidth={1.8} aria-hidden="true" />
                  열기
                </button>
              )
            )}
            <button type="button" onClick={save} className={TOOL_BUTTON}>
              <Download size={16} strokeWidth={1.8} aria-hidden="true" />
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


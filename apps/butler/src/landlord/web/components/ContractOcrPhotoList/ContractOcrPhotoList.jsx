// Created: 2026-11-20
// 계약서로 채우기(B팀, #181)에서 고른 계약서 사진 목록. 위에서부터 1쪽, 2쪽 순서로 읽는다.
// 줄마다 끌기 표시 · 미리보기 · 쪽 번호 · 위로 · 아래로 · 빼기, 아래에 [사진 추가] · [취소] · [N장 읽기].
// 순서는 줄을 끌어서(Pointer Events) 바꾸거나 위로 · 아래로 버튼(키보드 · 화면 낭독기)으로 바꾼다.
//  - 마우스: 줄을 누르고 4px 넘게 움직이면 끌기 시작
//  - 터치 · 펜: 줄을 0.3초 누르고 있으면 끌기 시작(그냥 쓸면 페이지 스크롤)
//  - 줄 안의 버튼을 누른 것은 끌기로 보지 않는다
// 사진이 없으면 빈 첨부창(안내 + [계약서 고르기])을 보여 준다. 여기서 PDF 1개를 골라도 된다.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, ImagePlus, X } from 'lucide-react';
import { Button } from '@butler/ui';

const ICON_BUTTON_CLASS =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:text-line disabled:hover:bg-transparent';

const MOUSE_DRAG_DISTANCE = 4;
const LONG_PRESS_MS = 300;
// 길게 누르는 동안 이만큼 넘게 움직이면 스크롤로 보고 끌기를 취소한다.
const LONG_PRESS_TOLERANCE = 8;

// 집은 줄은 조금 키우고 반투명(60%)하게 해 떠 보이게 하고, 놓으면 원래대로 돌린다. 그림자는 쓰지 않는다(design.md §4).
// 문자열이어야 한다. 숫자로 주면 React 18이 'px'를 붙여(1.04px) 브라우저가 무시한다.
const LIFTED_SCALE = '1.04';
const MOTION_MS = 150;
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// 위치(translate)와 크기(scale)를 따로 움직인다.
//  - 집은 줄: 손가락을 바로 따라가야 해서 위치는 움직임 없이, 크기만 부드럽게
//  - 다른 줄: 끄는 동안에만 비켜 서는 움직임. 놓을 때도 켜 두면 순서가 바뀌는 순간 줄이 한 번 튄다
//  - 놓은 뒤: 크기만 부드럽게 원래대로
const getRowTransition = (isDragging, isAnyDragging) => {
  if (prefersReducedMotion()) return 'none';
  if (isAnyDragging && !isDragging) return `translate ${MOTION_MS}ms ease-out, scale ${MOTION_MS}ms ease-out`;
  return `scale ${MOTION_MS}ms ease-out, opacity ${MOTION_MS}ms ease-out`;
};

// 놓일 자리: 아래로 끌 때는 끄는 줄의 아래 끝이 아래 줄의 절반을 넘으면 그 줄이 위로 밀리고,
// 위로 끌 때는 위 끝이 위 줄의 절반을 넘으면 그 줄이 아래로 밀린다.
const findDropIndex = (rects, fromIndex, offsetY) => {
  const from = rects[fromIndex];
  const top = from.top + offsetY;
  const bottom = top + from.height;
  const middleOf = (rect) => rect.top + rect.height / 2;
  const pushedUp = rects.filter((rect, index) => index > fromIndex && bottom > middleOf(rect)).length;
  const pushedDown = rects.filter((rect, index) => index < fromIndex && top < middleOf(rect)).length;
  return fromIndex + pushedUp - pushedDown;
};

// 끄는 동안 다른 줄이 비켜 설 거리
const getShift = (index, drag) => {
  if (!drag || index === drag.fromIndex) return 0;
  const { fromIndex, overIndex, height } = drag;
  if (fromIndex < overIndex && index > fromIndex && index <= overIndex) return -height;
  if (overIndex < fromIndex && index >= overIndex && index < fromIndex) return height;
  return 0;
};

// photos: [{ id, file, previewUrl }], onReorder(fromIndex, toIndex), onRemove(id)
export const ContractOcrPhotoList = ({ photos, maxPhotos, onReorder, onRemove, onAdd, onCancel, onRead, disabled = false }) => {
  const listRef = useRef(null);
  const rowRefs = useRef(new Map());
  // 누른 뒤 끌기가 시작되기 전 상태(다시 그리지 않으려고 ref): { pointerId, pointerType, index, startX, startY, timer }
  const pressRef = useRef(null);
  // 끄는 중: { pointerId, fromIndex, overIndex, startY, offsetY, height, rects }
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const canDrag = !disabled && photos.length > 1;
  const hasPhotos = photos.length > 0;

  const clearPress = () => {
    if (pressRef.current?.timer) clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };
  useEffect(() => clearPress, []);

  // 터치로 끄는 동안 페이지가 스크롤되지 않게 막는다(React의 touchmove는 passive라 직접 붙인다).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const blockScroll = (event) => {
      if (dragRef.current) event.preventDefault();
    };
    list.addEventListener('touchmove', blockScroll, { passive: false });
    return () => list.removeEventListener('touchmove', blockScroll);
  }, [hasPhotos]);

  const beginDrag = (row, press) => {
    const rects = photos.map((photo) => rowRefs.current.get(photo.id).getBoundingClientRect());
    try {
      row.setPointerCapture(press.pointerId);
    } catch {
      // 손을 이미 뗀 경우. 끌기는 이어지지 않고 pointerup에서 정리된다.
    }
    const next = { pointerId: press.pointerId, fromIndex: press.index, overIndex: press.index, startY: press.startY, offsetY: 0, height: rects[press.index].height, rects };
    // 다시 그리기 전에 오는 첫 touchmove도 스크롤을 막도록 ref를 바로 바꾼다.
    dragRef.current = next;
    pressRef.current = null;
    setDrag(next);
  };

  const handlePointerDown = (event, index) => {
    if (!canDrag || dragRef.current || event.target.closest('button')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    clearPress();
    const press = { pointerId: event.pointerId, pointerType: event.pointerType, index, startX: event.clientX, startY: event.clientY, timer: null };
    if (event.pointerType !== 'mouse') {
      const row = event.currentTarget;
      press.timer = setTimeout(() => {
        press.timer = null;
        if (pressRef.current === press) beginDrag(row, press);
      }, LONG_PRESS_MS);
    }
    pressRef.current = press;
  };

  const handlePointerMove = (event) => {
    const press = pressRef.current;
    if (press && !dragRef.current && event.pointerId === press.pointerId) {
      const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
      if (press.pointerType === 'mouse') {
        if (distance > MOUSE_DRAG_DISTANCE) beginDrag(event.currentTarget, press);
      } else if (distance > LONG_PRESS_TOLERANCE) {
        clearPress();
      }
      return;
    }

    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const { rects, fromIndex } = current;
    // 목록 맨 위 · 맨 아래 밖으로는 나가지 않게 한다.
    const minOffset = rects[0].top - rects[fromIndex].top;
    const maxOffset = rects[rects.length - 1].top - rects[fromIndex].top;
    const offsetY = Math.min(Math.max(event.clientY - current.startY, minOffset), maxOffset);
    setDrag({ ...current, offsetY, overIndex: findDropIndex(rects, fromIndex, offsetY) });
  };

  const handlePointerEnd = (event) => {
    if (pressRef.current?.pointerId === event.pointerId) clearPress();
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (event.type === 'pointerup' && current.overIndex !== current.fromIndex) onReorder(current.fromIndex, current.overIndex);
    setDrag(null);
  };

  return (
    <div className="space-y-3 rounded-input bg-surface-2 p-4">
      <div>
        <p className="text-label font-semibold text-ink">
          계약서 사진{' '}
          <span className="font-num tabular-nums">
            {photos.length} / {maxPhotos}
          </span>
        </p>
        <p className="text-sub text-ink-2">위에서부터 계약서 쪽 순서대로 놓아 주세요. 사진 줄을 끌어서(폰은 길게 눌러서) 순서를 바꿀 수 있어요.</p>
      </div>

      {hasPhotos ? (
        <ol ref={listRef} className="divide-y divide-line rounded-input border border-line bg-surface">
          {photos.map((photo, index) => {
            const isDragging = drag?.fromIndex === index;
            const shift = getShift(index, drag);
            const translateY = isDragging ? drag.offsetY : shift;
            // 끄는 동안 쪽 번호는 놓일 자리 기준으로 보여 준다.
            const pageNumber = isDragging ? drag.overIndex + 1 : index + 1 + Math.sign(shift);
            const dragClass = isDragging ? 'z-10 cursor-grabbing rounded-input opacity-60 outline outline-2 outline-accent' : canDrag ? 'cursor-grab' : '';
            return (
              <li
                key={photo.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(photo.id, node);
                  else rowRefs.current.delete(photo.id);
                }}
                onPointerDown={(event) => handlePointerDown(event, index)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                // 길게 누를 때 폰의 메뉴(이미지 저장 등)가 뜨지 않게 한다.
                onContextMenu={(event) => {
                  if (canDrag) event.preventDefault();
                }}
                style={{
                  translate: translateY ? `0 ${translateY}px` : undefined,
                  scale: isDragging ? LIFTED_SCALE : undefined,
                  transition: getRowTransition(isDragging, Boolean(drag)),
                  WebkitTouchCallout: 'none',
                }}
                className={`relative flex select-none items-center gap-2 bg-surface py-2 pl-2 pr-1 ${dragClass}`}
              >
                <GripVertical size={18} aria-hidden="true" className={`shrink-0 ${canDrag ? 'text-ink-3' : 'text-line'}`} />
                <img
                  src={photo.previewUrl}
                  alt={`${index + 1}쪽 미리보기`}
                  draggable={false}
                  className="h-14 w-11 shrink-0 rounded-chip border border-line object-cover"
                />
                <div className="min-w-0 flex-1 pl-1">
                  <p className="text-label font-semibold text-ink">
                    <span className="font-num tabular-nums">{pageNumber}</span>쪽
                  </p>
                  <p className="truncate text-sub text-ink-3">{photo.file.name}</p>
                </div>
                <button
                  type="button"
                  className={ICON_BUTTON_CLASS}
                  onClick={() => onReorder(index, index - 1)}
                  disabled={disabled || Boolean(drag) || index === 0}
                  aria-label={`${index + 1}쪽을 위로`}
                >
                  <ChevronUp size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={ICON_BUTTON_CLASS}
                  onClick={() => onReorder(index, index + 1)}
                  disabled={disabled || Boolean(drag) || index === photos.length - 1}
                  aria-label={`${index + 1}쪽을 아래로`}
                >
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={ICON_BUTTON_CLASS}
                  onClick={() => onRemove(photo.id)}
                  disabled={disabled || Boolean(drag)}
                  aria-label={`${index + 1}쪽 빼기`}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-input border border-dashed border-line bg-surface px-4 py-6 text-center text-sub text-ink-3">
          아직 고른 계약서가 없어요. 사진(최대 {maxPhotos}장)이나 PDF 1개를 골라 주세요.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onAdd} disabled={disabled || photos.length >= maxPhotos} className="mr-auto">
          <span className="flex items-center gap-1.5">
            <ImagePlus size={14} aria-hidden="true" />
            {photos.length === 0 ? '계약서 고르기' : '사진 추가'}
          </span>
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={disabled}>
          취소
        </Button>
        <Button type="button" size="sm" onClick={onRead} disabled={disabled || photos.length === 0}>
          {photos.length === 0 ? '읽기' : `${photos.length}장 읽기`}
        </Button>
      </div>
    </div>
  );
};

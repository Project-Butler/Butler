// 공유 계약서 구분과 사진 뷰어(B4·B5) 계산.
import { describe, expect, it } from 'vitest';
import { formatBytes, getFileBadge, isImageDocument, splitDocuments } from '../../src/shared/documentViewer/documentFiles';
import {
  clampOffset,
  clampScale,
  fitInto,
  formatZoom,
  MAX_SCALE,
  MIN_SCALE,
  swipeTarget,
  visibleRect,
  zoomAt,
} from '../../src/shared/documentViewer/viewerMath';

const pdf = { id: 'p', fileName: '계약서.pdf', mimeType: 'application/pdf', sizeBytes: 1258291 };
const jpg = { id: 'j', fileName: '1.jpg', mimeType: 'image/jpeg', sizeBytes: 2048 };
const png = { id: 'n', fileName: '2.png', mimeType: 'image/png', sizeBytes: 10 };

describe('공유 파일 구분', () => {
  it('파일은 위 줄, 사진은 격자. 뷰어는 파일 → 사진 순서로 넘긴다', () => {
    const { files, photos, ordered } = splitDocuments([jpg, pdf, png]);
    expect(files).toEqual([pdf]);
    expect(photos).toEqual([jpg, png]);
    expect(ordered.map((d) => d.id)).toEqual(['p', 'j', 'n']);
    expect(isImageDocument(jpg)).toBe(true);
    expect(isImageDocument(pdf)).toBe(false);
  });

  it('크기·표지', () => {
    expect(formatBytes(1258291)).toBe('1.2MB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2MB');
    expect(formatBytes(2048)).toBe('2KB');
    expect(formatBytes(10)).toBe('1KB');
    expect(formatBytes(undefined)).toBe('');
    expect(getFileBadge(pdf)).toBe('PDF');
    expect(getFileBadge({ fileName: 'a.hwp', mimeType: 'application/x-hwp' })).toBe('HWP');
  });
});

describe('뷰어 계산', () => {
  const stage = { width: 300, height: 400 };

  it('사진을 무대에 맞춘다(비율 유지)', () => {
    expect(fitInto({ width: 600, height: 800 }, stage)).toEqual({ ratio: 0.5, width: 300, height: 400 });
    const wide = fitInto({ width: 800, height: 600 }, stage);
    expect(wide.width).toBeCloseTo(300);
    expect(wide.height).toBeCloseTo(225);
  });

  it('배율은 1~4배', () => {
    expect(clampScale(0.3)).toBe(MIN_SCALE);
    expect(clampScale(9)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });

  it('확대하지 않으면 옮길 수 없고, 확대하면 빈 곳이 생기지 않는 만큼만', () => {
    const content = { width: 300, height: 400 };
    expect(clampOffset({ x: 50, y: 50 }, 1, stage, content)).toEqual({ x: 0, y: 0 });
    expect(clampOffset({ x: 500, y: -500 }, 2, stage, content)).toEqual({ x: 150, y: -200 });
  });

  it('누른 곳을 고정한 채 확대하고, 1배로 돌아오면 가운데', () => {
    const content = { width: 300, height: 400 };
    const zoomed = zoomAt({ scale: 1, offset: { x: 0, y: 0 } }, 2, { x: 100, y: 0 }, stage, content);
    expect(zoomed.scale).toBe(2);
    expect(zoomed.offset).toEqual({ x: -100, y: 0 });
    expect(zoomAt(zoomed, 0.5, { x: 0, y: 0 }, stage, content)).toEqual({ scale: 1, offset: { x: 0, y: 0 } });
  });

  it('작은 지도의 보는 곳 사각형', () => {
    const content = { width: 300, height: 400 };
    expect(visibleRect(1, { x: 0, y: 0 }, stage, content)).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    const rect = visibleRect(2, { x: 150, y: 200 }, stage, content);
    expect(rect).toEqual({ left: 0, top: 0, width: 0.5, height: 0.5 });
  });

  it('넘기기는 50px 이상 밀 때만, 처음·끝에서 멈춘다', () => {
    expect(swipeTarget(1, 3, -60)).toBe(2);
    expect(swipeTarget(1, 3, 60)).toBe(0);
    expect(swipeTarget(1, 3, 20)).toBe(1);
    expect(swipeTarget(2, 3, -60)).toBe(2);
    expect(swipeTarget(0, 3, 60)).toBe(0);
  });

  it('배율 칩', () => {
    expect(formatZoom(2.5)).toBe('250%');
  });
});

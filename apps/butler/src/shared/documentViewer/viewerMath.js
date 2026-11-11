// 사진 뷰어(B4·B5) 계산. 화면과 떼어 두어 테스트한다.
// 좌표는 무대(stage) 가운데를 원점으로 하는 픽셀. offset 은 확대된 사진의 가운데가 무대 가운데에서 얼마나 옮겨졌는지다.
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;
export const SWIPE_THRESHOLD = 50;

export const clampScale = (scale) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

// 90·270도 돌리면 가로세로가 바뀐다.
export const isSideways = (rotation) => ((rotation % 360) + 360) % 180 !== 0;

// 원본 크기(natural)를 무대 안에 꽉 차게(비율 유지) 놓았을 때의 배율과 보이는 크기. 돌린 방향을 반영한다.
export const fitInto = (natural, box, rotation = 0) => {
  if (!natural?.width || !natural?.height || !box?.width || !box?.height) return { ratio: 1, width: 0, height: 0 };
  const sideways = isSideways(rotation);
  const effectiveWidth = sideways ? natural.height : natural.width;
  const effectiveHeight = sideways ? natural.width : natural.height;
  const ratio = Math.min(box.width / effectiveWidth, box.height / effectiveHeight);
  return { ratio, width: effectiveWidth * ratio, height: effectiveHeight * ratio };
};

// 확대한 사진이 무대 밖으로 빈 곳을 남기지 않게 옮김 범위를 묶는다. 무대보다 작은 방향은 가운데에 고정한다.
export const clampOffset = (offset, scale, stage, content) => {
  const maxX = Math.max(0, (content.width * scale - stage.width) / 2);
  const maxY = Math.max(0, (content.height * scale - stage.height) / 2);
  const clamp = (value, max) => Math.min(max, Math.max(-max, value)) || 0;
  return { x: clamp(offset.x, maxX), y: clamp(offset.y, maxY) };
};

// point(무대 가운데 기준)를 고정한 채 배율을 바꾼다(두 손가락 가운데·두 번 누른 곳 기준 확대).
export const zoomAt = ({ scale, offset }, nextScale, point, stage, content) => {
  const target = clampScale(nextScale);
  if (target === MIN_SCALE) return { scale: MIN_SCALE, offset: { x: 0, y: 0 } };
  const factor = target / scale;
  const next = { x: point.x - (point.x - offset.x) * factor, y: point.y - (point.y - offset.y) * factor };
  return { scale: target, offset: clampOffset(next, target, stage, content) };
};

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// 작은 지도(오른쪽 위)에 그릴 '지금 보는 곳' 사각형. 사진 전체를 0~1 로 본 비율이다.
export const visibleRect = (scale, offset, stage, content) => {
  if (!content.width || !content.height) return { left: 0, top: 0, width: 1, height: 1 };
  const shownWidth = content.width * scale;
  const shownHeight = content.height * scale;
  const width = Math.min(1, stage.width / shownWidth);
  const height = Math.min(1, stage.height / shownHeight);
  const centerX = 0.5 - offset.x / shownWidth;
  const centerY = 0.5 - offset.y / shownHeight;
  const clamp01 = (value, size) => Math.min(1 - size, Math.max(0, value));
  return { left: clamp01(centerX - width / 2, width), top: clamp01(centerY - height / 2, height), width, height };
};

// 넘기기: 확대하지 않았을 때만, 일정 거리 이상 밀면 앞·뒤로. 처음·끝에서는 멈춘다.
export const swipeTarget = (index, count, dx) => {
  if (Math.abs(dx) < SWIPE_THRESHOLD) return index;
  const next = dx < 0 ? index + 1 : index - 1;
  return Math.min(count - 1, Math.max(0, next));
};

export const formatZoom = (scale) => `${Math.round(scale * 100)}%`;

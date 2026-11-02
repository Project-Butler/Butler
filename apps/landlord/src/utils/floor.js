// 층 입력·표시. 서버 floor는 정수(-10~200, 지하는 음수). 화면은 지하를 'B1'로 쓴다.
// 입력은 '12', '12층', '-1', 'B1', 'b1', '지하1', '지하 1층'을 받는다.
const MIN_FLOOR = -10;
const MAX_FLOOR = 200;

const BASEMENT_PATTERN = /^(?:B|지하)(\d+)$/;
const FLOOR_PATTERN = /^-?\d+$/;

// 빈 값이면 null, 읽을 수 없으면 NaN, 아니면 정수
export const parseFloorInput = (value) => {
  const text = String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/층$/, '');
  if (!text) return null;
  const basement = BASEMENT_PATTERN.exec(text);
  if (basement) return -Number(basement[1]);
  return FLOOR_PATTERN.test(text) ? Number(text) : Number.NaN;
};

export const validateFloorInput = (value) => {
  const floor = parseFloorInput(value);
  if (floor === null) return undefined;
  if (!Number.isInteger(floor) || floor < MIN_FLOOR || floor > MAX_FLOOR) {
    return `숫자로 입력해 주세요. 지하는 B1처럼 적어요(B${-MIN_FLOOR}~${MAX_FLOOR}층).`;
  }
  return undefined;
};

// -1 → 'B1', 12 → '12층'. 값이 없으면 null.
export const formatFloor = (floor) => {
  if (floor == null) return null;
  return floor < 0 ? `B${-floor}` : `${floor}층`;
};

// 수정 칸 처음 값: -1 → 'B1', 12 → '12'
export const toFloorText = (floor) => {
  if (floor == null) return '';
  return floor < 0 ? `B${-floor}` : String(floor);
};

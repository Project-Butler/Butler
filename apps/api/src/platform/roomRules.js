// 방(위치) 태그 규칙(DB 의존 없음). 하우스 로그 기록과 수리 요청이 같이 쓰는 버틀러 공통 위치 태그.
// 등록형: 새 방을 더하면 여기와 화면의 방 라벨을 함께 고친다.
export const ROOMS = ['ENTRANCE', 'LIVING', 'KITCHEN', 'BATHROOM', 'BEDROOM', 'UTILITY', 'BALCONY', 'BOILER_ROOM', 'OTHER'];

// 목록 필터에서 '방 없음'(room이 null)을 고를 때 쓰는 값. 저장 값으로는 쓰지 않는다.
export const ROOM_FILTER_NONE = 'NONE';

export const ROOM_LABELS = {
  ENTRANCE: '현관',
  LIVING: '거실',
  KITCHEN: '주방',
  BATHROOM: '욕실·화장실',
  BEDROOM: '침실',
  UTILITY: '다용도실',
  BALCONY: '베란다',
  BOILER_ROOM: '보일러실',
  OTHER: '기타',
};

// 저장 값 검사. null(방 없음)은 허용. 틀리면 details에 넣고 undefined.
export const parseRoom = (value, details, field = 'room') => {
  if (value === null) return null;
  if (ROOMS.includes(value)) return value;
  details.push({ field, reason: `${ROOMS.join(', ')} 중 하나 또는 null이어야 합니다.` });
  return undefined;
};

// 목록 Query room('KITCHEN,NONE'처럼 쉼표). 빈 값은 필터 없음.
export const parseRoomFilter = (value, details) => {
  if (value === undefined || value === '') return [];
  const rooms = value.split(',').map((item) => item.trim());
  const allowed = [...ROOMS, ROOM_FILTER_NONE];
  if (rooms.some((room) => !allowed.includes(room))) {
    details.push({ field: 'room', reason: `${allowed.join(', ')} 중에서 쉼표로 고릅니다.` });
  }
  return rooms;
};

// Prisma where 조각. NONE은 room이 null인 기록.
export const toRoomWhere = (rooms) => {
  if (!rooms || rooms.length === 0) return {};
  const named = rooms.filter((room) => room !== ROOM_FILTER_NONE);
  const conditions = [];
  if (named.length > 0) conditions.push({ room: { in: named } });
  if (rooms.includes(ROOM_FILTER_NONE)) conditions.push({ room: null });
  return conditions.length === 1 ? conditions[0] : { OR: conditions };
};

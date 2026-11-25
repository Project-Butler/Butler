// 방(위치) 태그(계약 5장, 하우스 로그 개편 H-02). 서버 apps/api/src/platform/roomRules.js와 같은 값·라벨.
// 하우스 로그 기록과 수리 요청이 같이 쓴다. 웹·앱 공용.
const ROOM_LABEL = {
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

// 목록 필터에서 '방 없음'(room이 null)을 고를 때 쓰는 값. 저장 값으로는 쓰지 않는다.
export const ROOM_FILTER_NONE = 'NONE';
export const ROOM_NONE_LABEL = '방 없음';

// 기록 팝업의 방 고르기(9가지).
export const ROOM_OPTIONS = Object.entries(ROOM_LABEL).map(([value, label]) => ({ value, label }));
// 목록 거르기의 방(9가지 + 방 없음).
export const ROOM_FILTER_OPTIONS = [...ROOM_OPTIONS, { value: ROOM_FILTER_NONE, label: ROOM_NONE_LABEL }];

// 모르는 값은 그대로, 없으면 null(화면이 '—'로 보여 준다).
export const getRoomLabel = (room) => (room ? (ROOM_LABEL[room] ?? room) : null);

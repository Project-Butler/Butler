// 방(위치) 태그. 서버 값(apps/api platform/roomRules.js)과 어긋나지 않게 고정한다.
import { describe, expect, it } from 'vitest';
import { getRoomLabel, ROOM_FILTER_NONE, ROOM_FILTER_OPTIONS, ROOM_OPTIONS } from '../../src/shared/room';

describe('방 태그', () => {
  it('9가지 값과 라벨이 서버와 같다', () => {
    expect(ROOM_OPTIONS).toEqual([
      { value: 'ENTRANCE', label: '현관' },
      { value: 'LIVING', label: '거실' },
      { value: 'KITCHEN', label: '주방' },
      { value: 'BATHROOM', label: '욕실·화장실' },
      { value: 'BEDROOM', label: '침실' },
      { value: 'UTILITY', label: '다용도실' },
      { value: 'BALCONY', label: '베란다' },
      { value: 'BOILER_ROOM', label: '보일러실' },
      { value: 'OTHER', label: '기타' },
    ]);
  });

  it('거르기에는 끝에 방 없음(NONE)이 붙는다', () => {
    expect(ROOM_FILTER_OPTIONS).toHaveLength(10);
    expect(ROOM_FILTER_OPTIONS.at(-1)).toEqual({ value: ROOM_FILTER_NONE, label: '방 없음' });
    expect(ROOM_FILTER_NONE).toBe('NONE');
  });

  it('라벨: 없으면 null, 모르는 값은 그대로', () => {
    expect(getRoomLabel('BOILER_ROOM')).toBe('보일러실');
    expect(getRoomLabel(null)).toBeNull();
    expect(getRoomLabel('ATTIC')).toBe('ATTIC');
  });
});

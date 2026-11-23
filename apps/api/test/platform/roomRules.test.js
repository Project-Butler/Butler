// 방(위치) 태그 규칙(하우스 로그 개편 H-02). DB 없음.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRoom, parseRoomFilter, ROOM_LABELS, ROOMS, toRoomWhere } from '../../src/platform/roomRules.js';

test('방 값: 9가지와 null(방 없음)만 받는다', () => {
  assert.deepEqual(ROOMS, ['ENTRANCE', 'LIVING', 'KITCHEN', 'BATHROOM', 'BEDROOM', 'UTILITY', 'BALCONY', 'BOILER_ROOM', 'OTHER']);
  const details = [];
  for (const room of ROOMS) assert.equal(parseRoom(room, details), room);
  assert.equal(parseRoom(null, details), null);
  assert.equal(details.length, 0);

  assert.equal(parseRoom('GARAGE', details), undefined);
  assert.equal(parseRoom('NONE', details), undefined);
  assert.equal(parseRoom('', details), undefined);
  assert.equal(details.length, 3);
  assert.equal(details[0].field, 'room');
});

test('방 라벨이 모든 방에 있다', () => {
  assert.deepEqual(Object.keys(ROOM_LABELS).sort(), [...ROOMS].sort());
  assert.equal(ROOM_LABELS.BATHROOM, '욕실·화장실');
  assert.equal(ROOM_LABELS.UTILITY, '다용도실');
  assert.equal(ROOM_LABELS.BALCONY, '베란다');
  assert.equal(ROOM_LABELS.BOILER_ROOM, '보일러실');
});

test('목록 필터: 쉼표, NONE 허용, 모르는 값은 400 사유', () => {
  const details = [];
  assert.deepEqual(parseRoomFilter(undefined, details), []);
  assert.deepEqual(parseRoomFilter('', details), []);
  assert.deepEqual(parseRoomFilter('KITCHEN, NONE', details), ['KITCHEN', 'NONE']);
  assert.deepEqual(parseRoomFilter('BOILER_ROOM,UTILITY', details), ['BOILER_ROOM', 'UTILITY']);
  assert.equal(details.length, 0);
  parseRoomFilter('KITCHEN,ATTIC', details);
  assert.equal(details[0].field, 'room');
});

test('where 조각: 방만, 방 없음만, 둘 다', () => {
  assert.deepEqual(toRoomWhere([]), {});
  assert.deepEqual(toRoomWhere(undefined), {});
  assert.deepEqual(toRoomWhere(['KITCHEN', 'BATHROOM']), { room: { in: ['KITCHEN', 'BATHROOM'] } });
  assert.deepEqual(toRoomWhere(['NONE']), { room: null });
  assert.deepEqual(toRoomWhere(['BATHROOM', 'NONE']), { OR: [{ room: { in: ['BATHROOM'] } }, { room: null }] });
});

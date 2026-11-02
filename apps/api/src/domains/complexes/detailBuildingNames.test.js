import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDetailBuildingRange, parseDetailBuildingNames } from './detailBuildingNames.js';

test('detBdNmList: 쉼표로 나누고 공백·중복·빈 값을 없애고 자연 정렬', () => {
  assert.deepEqual(parseDetailBuildingNames('103동,101동, 102동,,102동'), ['101동', '102동', '103동']);
  assert.deepEqual(parseDetailBuildingNames('10동,2동,1동'), ['1동', '2동', '10동']);
  assert.deepEqual(parseDetailBuildingNames(' 상가 동 '), ['상가동']);
  assert.deepEqual(parseDetailBuildingNames(''), []);
  assert.deepEqual(parseDetailBuildingNames(null), []);
});

test('표시: 숫자 동이 이어지면 범위(그 밖의 이름은 외 N개), 아니면 앞 3개 + 외 N개', () => {
  assert.equal(formatDetailBuildingRange(['101동', '102동', '103동', '104동', '105동']), '101동~105동');
  // juso 학여울청구 실제 목록 모양: 숫자 동 101~117 + 상가·어린이집·관리사무소
  const hakyeoul = parseDetailBuildingNames(
    '103동,117동,107동,116동,상가동-B,어린이집,113동,114동,111동,112동,관리사무소.경로당,109동,110동,108동,106동,105동,104동,102동,101동,115동',
  );
  assert.equal(formatDetailBuildingRange(hakyeoul), '101동~117동 외 3개');
  assert.equal(formatDetailBuildingRange(['101동', '103동', '104동', '105동']), '101동, 103동, 104동 외 1개');
  assert.equal(formatDetailBuildingRange(['가동', '나동', '다동', '라동', '마동']), '가동, 나동, 다동 외 2개');
  assert.equal(formatDetailBuildingRange(['118동']), '118동');
  assert.equal(formatDetailBuildingRange([]), null);
});

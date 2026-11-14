import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editDistance, findClosestWord, latinToHangul, maxTypoDistance, toJamo } from '../../../src/domains/disputes/searchSuggestion.js';

const vocabulary = (counts) => Object.entries(counts).map(([word, docCount]) => ({ word, jamo: toJamo(word), docCount }));

test('자모: 한글 음절을 초성·중성·(종성)으로 나누고, 한글이 아닌 글자는 그대로 둔다', () => {
  assert.equal(toJamo('보').length, 2);
  assert.equal(toJamo('금').length, 3);
  assert.equal(toJamo('보증금').length, 8);
  assert.equal(toJamo('A1'), 'A1');
});

test('편집 거리: 모음 하나 다르면 1, ㅐ↔ㅔ처럼 헷갈리는 모음은 0.5, limit을 넘으면 limit + 1', () => {
  const distance = (a, b, limit = 2) => editDistance(toJamo(a), toJamo(b), limit);
  assert.equal(distance('보증굼', '보증금'), 1);
  assert.equal(distance('전새', '전세'), 0.5);
  assert.equal(distance('임데인', '임대인'), 0.5);
  assert.equal(distance('전새', '전대'), 1);
  assert.equal(distance('보증금', '보증금'), 0);
  assert.equal(distance('보증금', '권리금', 2), 3);
});

test('허용 거리: 두 글자 말은 1, 세 글자 이상은 2', () => {
  assert.equal(maxTypoDistance('월세'), 1);
  assert.equal(maxTypoDistance('보증금'), 2);
});

test('가장 가까운 낱말: 거리가 가까운 말, 같으면 자료에 많이 나온 말, 자기 자신은 건너뛴다', () => {
  const words = vocabulary({ 전세: 300, 전대: 500, 월세: 1000, 보증금: 1600, 윌세: 2 });
  assert.equal(findClosestWord('전새', words).word, '전세'); // 0.5 < 1(전대)
  assert.equal(findClosestWord('보증굼', words).word, '보증금');
  assert.equal(findClosestWord('윌세', words).word, '월세'); // 사전에 오자 "윌세"가 있어도 자기 자신은 건너뜀
  assert.equal(findClosestWord('권리금', words), null); // 가까운 말 없음
  assert.equal(findClosestWord('세', words), null); // 한 글자는 제안 안 함
  assert.equal(findClosestWord('abc', words), null); // 한글이 아니면 제안 안 함
});

test('한/영 전환: 영문 자판으로 친 말을 두벌식 한글로 바꾼다', () => {
  assert.equal(latinToHangul('qhwmdrma'), '보증금');
  assert.equal(latinToHangul('dlaeodls'), '임대인');
  assert.equal(latinToHangul('rnjsflrma'), '권리금');
  assert.equal(latinToHangul('wjsdlqtlsrh'), '전입신고');
  assert.equal(latinToHangul('qhwmdrmadmf'), '보증금을'); // 조사도 그대로
  assert.equal(latinToHangul('rhksflql'), '관리비'); // ㅗ+ㅏ = ㅘ
  assert.equal(latinToHangul('rkqt'), '값'); // ㅂ+ㅅ = ㅄ 겹받침
  assert.equal(latinToHangul('dlfrdj'), '읽어'); // ㄹ+ㄱ = ㄺ
  assert.equal(latinToHangul('dlfrj'), '일거'); // 겹받침 뒤에 모음이 오면 뒤 자음은 다음 글자 초성(자판으로 칠 때와 같음)
  assert.equal(latinToHangul('Tkdgo'), '쌍해'); // Shift = 쌍자음
  assert.equal(latinToHangul('QHWMDRMA'), '보증금'); // Caps Lock
  assert.equal(latinToHangul('hug'), null); // 음절로 안 묶임
  assert.equal(latinToHangul('LH'), null);
  assert.equal(latinToHangul('보증금'), null); // 영문이 아니면 null
  assert.equal(latinToHangul('abc1'), null);
});

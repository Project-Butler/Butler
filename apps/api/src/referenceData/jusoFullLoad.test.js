import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateFullGate, FULL_GATE, summarizeFullLinks } from './jusoFullLoad.js';

const GOOD = {
  rowsRead: 10_718_170,
  linkRate: 0.9994,
  ruleRatios: { ROAD_KEY: 0.967, LOT: 0.02, NON_APT_FLAG: 0.0156 },
};

test('전체분 게이트: 2026-09 실측 수준이면 통과', () => {
  assert.deepEqual(evaluateFullGate(GOOD), { ok: true });
});

test('전체분 게이트: 잘린 파일(읽은 줄 100만 미만)은 실패', () => {
  const gate = evaluateFullGate({ ...GOOD, rowsRead: 593_101 });
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /rows read 593101/);
});

test('전체분 게이트: 잘린 파일(시도 일부만)이라 연결률·규칙 비율이 떨어지면 실패', () => {
  assert.match(evaluateFullGate({ ...GOOD, rowsRead: 5_000_000, linkRate: 0.5 }).reason, /link rate 50.0%/);
  const skewed = { ...GOOD, ruleRatios: { ROAD_KEY: 0.94, LOT: 0.04, NON_APT_FLAG: 0.015 } };
  assert.match(evaluateFullGate(skewed).reason, /ROAD_KEY ratio 94.0% outside 96.4±1.5%p/);
});

test('전체분 게이트(다시 돌릴 때): 지난 성공보다 연결률 5%p 넘게 하락·읽은 줄 90% 미만이면 실패', () => {
  const last = { rowsRead: 10_718_170, linkRate: 0.9994 };
  assert.equal(evaluateFullGate(GOOD, last).ok, true);
  const lowRate = { ...GOOD, linkRate: 0.951 };
  assert.equal(evaluateFullGate(lowRate, { ...last, linkRate: 1.02 }).ok, false);
  assert.match(evaluateFullGate({ ...GOOD, rowsRead: 9_000_000 }, last).reason, /below 90%/);
});

test('규칙별 비율은 단지마다 가장 강한 규칙(ROAD_KEY > LOT > NON_APT_FLAG) 하나로 센다', () => {
  const links = new Map([
    ['b1', { kaptCode: 'A1', matchRule: 'LOT' }],
    ['b2', { kaptCode: 'A1', matchRule: 'ROAD_KEY' }],
    ['b3', { kaptCode: 'A2', matchRule: 'NON_APT_FLAG' }],
    ['b4', { kaptCode: 'A3', matchRule: 'LOT' }],
    ['b5', { kaptCode: 'X9', matchRule: 'ROAD_KEY' }], // 엑셀에 없는 단지(KAPT_API)는 분모·분자에 넣지 않는다
  ]);
  const summary = summarizeFullLinks(links, new Set(['A1', 'A2', 'A3', 'A4']));
  assert.equal(summary.linkedExcelCodes, 3);
  assert.equal(summary.linkRate, 0.75);
  assert.deepEqual(summary.ruleCodes, { ROAD_KEY: 1, LOT: 1, NON_APT_FLAG: 1 });
  assert.equal(summary.linkedCodes, 4);
});

test('게이트 기준값은 계획(§7-2) 수치', () => {
  assert.equal(FULL_GATE.minRowsRead, 1_000_000);
  assert.equal(FULL_GATE.minLinkRate, 0.95);
  assert.deepEqual(FULL_GATE.ruleRatios, { ROAD_KEY: 0.964, LOT: 0.02, NON_APT_FLAG: 0.015 });
});

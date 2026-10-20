// 같음 테스트(매일 cron을 켜기 전 조건, 계획 §7-3):
// "표본 t0를 전체분 경로로 적재 + 합성 변동분을 변동분 경로로 적용" == "표본 t1을 전체분 경로로 처음부터 적재"(행 단위).
// 표본 t0 = 2026-09 전체분에서 노원구 중계동(공동주택 전부 + 비공동주택 100줄)·하계동 동일로207길 186·세종 3611010800만 뽑은 줄.
// 표본 t1 = t0 원본에 합성 줄을 반영한 전체분 형식(31·73 줄 추가, 34 줄 교체, 63·72 줄 삭제).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildKaptLookup, parseBuildingLine } from './jusoBuildingMatcher.js';
import { applyOpsToMap, collapseDeltaOps, planDeltaLine } from './jusoDeltaApplier.js';
import { collectFullLinks } from './jusoFullLoad.js';

const SAMPLE_LINES = readFileSync(new URL('./fixtures/juso-buildings-sample.txt', import.meta.url), 'utf8')
  .split('\n')
  .filter(Boolean);
const LOOKUP = buildKaptLookup(JSON.parse(readFileSync(new URL('./fixtures/kapt-lookup-sample.json', import.meta.url), 'utf8')));

const setField = (text, position, value) => {
  const fields = text.split('|');
  fields[position - 1] = value;
  return fields.join('|');
};
const mgtOf = (text) => text.split('|')[15];
const withCode = (text, code) => setField(text, 23, code);
const newMgt = (text, suffix) => `${mgtOf(text).slice(0, 19)}${suffix}`;

async function* iterate(lines) {
  yield* lines;
}

const toSortedRows = (map) =>
  [...map.values()]
    .map((link) => [link.buildingMgtNo, link.roadSigunguCd, link.roadNameKey, link.roadUnderground, link.roadMainNo, link.roadSubNo, link.kaptCode, link.matchRule].join('|'))
    .sort();

test('같음 테스트: 전체분(t0) + 합성 변동분 = 전체분(t1)', async () => {
  const full0 = await collectFullLinks(iterate(SAMPLE_LINES), LOOKUP);
  const linked = SAMPLE_LINES.filter((text) => full0.links.has(mgtOf(text)));
  const unlinked = SAMPLE_LINES.filter((text) => !full0.links.has(mgtOf(text)));
  const byRule = (rule) => linked.filter((text) => full0.links.get(mgtOf(text)).matchRule === rule);
  assert.ok(byRule('ROAD_KEY').length > 10, '표본에 도로명 키 연결이 있어야 한다');
  assert.ok(unlinked.length > 10, '표본에 연결 안 된 건물이 있어야 한다');

  const road = byRule('ROAD_KEY');
  // 다른 단지의 도로명 키를 가진 줄(34 도로명 변경 대상)
  const otherComplex = road.find((text) => full0.links.get(mgtOf(text)).kaptCode !== full0.links.get(mgtOf(road[0])).kaptCode);
  assert.ok(otherComplex, '표본에 단지가 둘 이상 있어야 한다');
  const otherFields = otherComplex.split('|');
  const nonApt = unlinked.find((text) => text.split('|')[26] === '0');

  const adds = [
    withCode(setField(road[0], 16, newMgt(road[0], '900001')), '31'), // 신규 건물(연결됨)
    withCode(setField(road[1], 16, newMgt(road[1], '900002')), '73'), // 건물군 일부 생성
    withCode(setField(unlinked[0], 16, newMgt(unlinked[0], '900003')), '31'), // 신규 건물(연결 안 됨)
  ];
  const changes = [
    withCode(setField(road[2], 15, '999동'), '34'), // 속성만 변경(연결 그대로)
    withCode(setField(setField(setField(road[3], 10, otherFields[9]), 12, otherFields[11]), 13, otherFields[12]), '34'), // 도로명 변경 → 다른 단지
    withCode(setField(setField(road[4], 12, '9999'), 27, '0'), '34'), // 공동주택 표시가 빠지고 주소도 안 맞음 → 연결 삭제
    withCode(setField(setField(setField(setField(nonApt, 27, '1'), 10, otherFields[9]), 12, otherFields[11]), 13, otherFields[12]), '34'), // 안 맞던 건물이 맞게 됨
  ];
  const removes = [withCode(road[5], '63'), withCode(road[6], '72'), withCode(unlinked[1], '63')];
  // 한 파일 안에서 같은 건물이 두 번: 신규 뒤 변경
  const twice = withCode(setField(adds[0], 15, '두번째'), '34');
  const deltaLines = [...adds, ...changes, ...removes, twice];

  // t1: t0 원본에 반영한 전체분 형식 파일
  const replaced = new Map([...changes, twice].map((text) => [mgtOf(text), text]));
  const removed = new Set(removes.map(mgtOf));
  const t1 = SAMPLE_LINES.filter((text) => !removed.has(mgtOf(text))).map((text) => replaced.get(mgtOf(text)) ?? text);
  for (const text of adds) t1.push(replaced.get(mgtOf(text)) ?? text);

  // 변동분 경로: 줄 계획 → 3줄 묶음마다 적용(커서 경계 포함)
  const viaDelta = new Map(full0.links);
  const ops = deltaLines.map((text) => planDeltaLine(text, LOOKUP));
  assert.equal(ops.filter((op) => op.kind === 'unknown' || op.kind === 'invalid').length, 0);
  for (let cursor = 0; cursor < ops.length; cursor += 3) applyOpsToMap(viaDelta, collapseDeltaOps(ops.slice(cursor, cursor + 3)));

  const full1 = await collectFullLinks(iterate(t1), LOOKUP);
  assert.deepEqual(toSortedRows(viaDelta), toSortedRows(full1.links));

  // 변동분이 실제로 무언가를 바꿨는지(빈 비교가 아님)
  assert.notDeepEqual(toSortedRows(full0.links), toSortedRows(full1.links));
  assert.equal(viaDelta.get(mgtOf(changes[1])).kaptCode, full0.links.get(mgtOf(otherComplex)).kaptCode);
  assert.equal(viaDelta.has(mgtOf(changes[2])), false);
  assert.equal(viaDelta.has(mgtOf(changes[3])), true);
  assert.equal(viaDelta.has(mgtOf(removes[0])), false);
  assert.equal(viaDelta.has(mgtOf(adds[0])), true);
  assert.equal(viaDelta.has(mgtOf(adds[2])), false);
});

test('표본: 중계그린 도로명주소 3개가 모두 같은 단지(A13986306)로, 학여울청구 공유 주소는 분양 단지로', async () => {
  const { links } = await collectFullLinks(iterate(SAMPLE_LINES), LOOKUP);
  const keysOf = (kaptCode) =>
    new Set([...links.values()].filter((link) => link.kaptCode === kaptCode).map((link) => `${link.roadNameKey} ${link.roadMainNo}`));
  assert.deepEqual([...keysOf('A13986306')].sort(), ['동일로207길 17', '동일로207길 18', '섬밭로 285']);
  const shared = [...links.values()].filter((link) => link.roadNameKey === '동일로207길' && link.roadMainNo === 186);
  assert.ok(shared.length > 0);
  assert.ok(shared.every((link) => link.kaptCode === 'A13987305'));
  assert.ok(SAMPLE_LINES.every((text) => parseBuildingLine(text)));
});

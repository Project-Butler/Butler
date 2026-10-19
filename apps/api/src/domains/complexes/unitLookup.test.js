import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HO_FORMATS,
  MAX_LOOKUP_MISSES,
  decideAfterStoredMiss,
  decideDiscoveryWrite,
  filterExclusiveRows,
  findRegistryDong,
  isMissActive,
  shouldUseStoredLookup,
  toDongCompareKey,
  toHoRequest,
  toHoRequests,
  toUnitInfo,
} from './unitLookup.js';

test('대장 동 이름 비교 키: 제·주건축물제·동·공백·전각을 맞춘다', () => {
  assert.equal(toDongCompareKey('103동'), '103');
  assert.equal(toDongCompareKey('제103동'), '103');
  assert.equal(toDongCompareKey('주건축물제103동'), '103');
  assert.equal(toDongCompareKey(' 103 동 '), '103');
  assert.equal(toDongCompareKey('１０３동'), '103');
  assert.equal(toDongCompareKey('103'), '103');
  assert.equal(toDongCompareKey('가동'), '가');
  assert.equal(toDongCompareKey('가'), '가');
  assert.equal(toDongCompareKey(''), '');
  assert.equal(toDongCompareKey(null), '');
});

test('표제부에서 입력 동의 대장 표기를 찾는다', () => {
  const titles = [{ dongNm: '제101동' }, { dongNm: '제103동' }, { dongNm: '관리동' }];
  assert.deepEqual(findRegistryDong(titles, '103', '역북마을보성'), { registryDongNm: '제103동', hoFormats: HO_FORMATS });
  assert.equal(findRegistryDong(titles, '105', '역북마을보성'), null);
  assert.equal(findRegistryDong([], '105', '역북마을보성'), null);
});

test('동 칸이 비었거나 단지명이면 호 칸에 동이 들어가는 형식만 쓴다', () => {
  assert.deepEqual(findRegistryDong([{ dongNm: '스카이빌' }], '101', '스카이빌'), {
    registryDongNm: '스카이빌',
    hoFormats: ['D동 N호'],
  });
  assert.deepEqual(findRegistryDong([{ dongNm: ' ' }], '101', '스카이빌'), { registryDongNm: null, hoFormats: ['D동 N호'] });
  // 다른 동 이름이 있는 필지에서는 빈 칸 행(상가 등)을 입력 동으로 보지 않는다.
  assert.equal(findRegistryDong([{ dongNm: '101동' }, { dongNm: '' }], '117', '중계그린'), null);
});

test('호 표기 후보: N → N호 → F층N호 → D동 N호(동 칸 비움)', () => {
  assert.deepEqual(toHoRequests(HO_FORMATS, '1203', '101'), [
    { hoFormat: 'N', hoNm: '1203', omitDong: false },
    { hoFormat: 'N호', hoNm: '1203호', omitDong: false },
    { hoFormat: 'F층N호', hoNm: '12층1203호', omitDong: false },
    { hoFormat: 'D동 N호', hoNm: '101동 1203호', omitDong: true },
  ]);
  assert.equal(toHoRequest('F층N호', '304', '105').hoNm, '3층304호');
  assert.equal(toHoRequest('D동 N호', '303', '가동').hoNm, '가동 303호');
});

test('호 표기 후보: 층을 알 수 없는 호는 F층N호를 빼고, 저장된 형식을 맨 앞에', () => {
  assert.deepEqual(
    toHoRequests(HO_FORMATS, 'B01', '101').map((request) => request.hoFormat),
    ['N', 'N호', 'D동 N호'],
  );
  assert.deepEqual(
    toHoRequests(HO_FORMATS, '304', '105', 'N호').map((request) => request.hoFormat),
    ['N호', 'N', 'F층N호', 'D동 N호'],
  );
  assert.equal(toHoRequest('모름', '304', '105'), null);
});

test('전유 행만 고르고 면적은 합친다(지하층은 음수)', () => {
  const rows = [
    { exposPubuseGbCdNm: '전유', dongNm: '제103동', hoNm: '1203', area: '30.1', flrNo: '12', flrGbCdNm: '지상' },
    { exposPubuseGbCdNm: '전유', dongNm: '제103동', hoNm: '1203', area: '5.14', flrNo: '12' },
    { exposPubuseGbCdNm: '공용', dongNm: '제103동', hoNm: '1203', area: '10' },
    { exposPubuseGbCdNm: '전유', dongNm: '제104동', hoNm: '1203', area: '30' },
  ];
  const exclusive = filterExclusiveRows(rows, { registryDongNm: '제103동', hoNm: '1203', omitDong: false });
  assert.equal(exclusive.length, 2);
  assert.deepEqual(toUnitInfo(exclusive), { exclusiveArea: 35.24, floor: 12 });
  assert.deepEqual(toUnitInfo([{ area: '20', flrNo: '1', flrGbCdNm: '지하' }]), { exclusiveArea: 20, floor: -1 });
});

test('동 칸 비움 형식은 호 칸만 공백 무시로 비교', () => {
  const rows = [{ exposPubuseGbCdNm: '전유', dongNm: '스카이빌', hoNm: '101동303호', area: '59.9', flrNo: '3' }];
  assert.equal(filterExclusiveRows(rows, { registryDongNm: null, hoNm: '101동 303호', omitDong: true }).length, 1);
});

test('캐시: 저장된 방법은 연속 실패가 적을 때만 먼저 쓴다', () => {
  assert.equal(shouldUseStoredLookup(null), false);
  assert.equal(shouldUseStoredLookup({ missCount: 0 }), true);
  assert.equal(shouldUseStoredLookup({ missCount: MAX_LOOKUP_MISSES - 1 }), true);
  assert.equal(shouldUseStoredLookup({ missCount: MAX_LOOKUP_MISSES }), false);
});

test('캐시: 음성 캐시는 만료 전까지만', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  assert.equal(isMissActive(null, now), false);
  assert.equal(isMissActive({ expiresAt: new Date('2026-10-20T01:00:00Z') }, now), true);
  assert.equal(isMissActive({ expiresAt: new Date('2026-10-19T23:00:00Z') }, now), false);
});

test('캐시: 찾기 절차 뒤 저장 — 찾음 upsert, 동 없음만 음성 캐시, 호만 없음·장애는 저장 안 함', () => {
  assert.equal(decideDiscoveryWrite({ found: true, dongFound: true, hadError: false }), 'upsert');
  assert.equal(decideDiscoveryWrite({ found: false, dongFound: false, hadError: false }), 'miss');
  assert.equal(decideDiscoveryWrite({ found: false, dongFound: true, hadError: false }), 'none');
  assert.equal(decideDiscoveryWrite({ found: false, dongFound: false, hadError: true }), 'none');
});

test('캐시: 저장된 방법이 실패하면 동이 있을 때만 저장값을 유지', () => {
  assert.equal(decideAfterStoredMiss(true), 'keep');
  assert.equal(decideAfterStoredMiss(false), 'rediscover');
  assert.equal(decideAfterStoredMiss(null), 'rediscover');
});

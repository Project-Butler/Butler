import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildLinkIndex,
  dealLotKey,
  legalDongCodeOf,
  linkDeals,
  linkStoredKeys,
  normalizeComplexName,
  parseJibun,
  roadKeyOf,
  sameComplexName,
} from '../../../src/domains/marketPrices/linkComplex.js';
import { normalizeItem, parseRtmsXml } from '../../../src/domains/marketPrices/rtmsProvider.js';
import { JUNGGYE_GREEN_LINES, JUNGGYE_GREEN_XML } from './fixtures/junggyeGreenTrades.js';
import { RENT_XML, TRADE_XML } from './fixtures/rtmsResponses.js';

const trades = parseRtmsXml(TRADE_XML).items.map((item) => normalizeItem('TRADE', item));
const rents = parseRtmsXml(RENT_XML).items.map((item) => normalizeItem('RENT', item));
const REGIONS = [
  { id: '1171010100', dongName: '잠실동' },
  { id: '1171010300', dongName: '풍납동' },
  { id: '1171011300', dongName: '거여동' },
];

describe('잇기 키', () => {
  test('도로명 키는 A팀 sourceKey 와 같은 규칙 — 앞 0 을 떼고, 지상지하 칸이 비면 지상(0)', () => {
    assert.equal(roadKeyOf(trades[0].road), 'ROAD:117103123015-0-62-0'); // 트리지움
    assert.equal(roadKeyOf(trades[2].road), 'ROAD:117102005011-0-345-0'); // 헬리오시티(지상지하 빈 칸)
    assert.equal(roadKeyOf({ sigunguCode: '11710', roadCode: '3123019', undergroundCode: '1', mainNoText: '00038', subNoText: '00006' }), 'ROAD:117103123019-1-38-6');
    assert.equal(roadKeyOf({ sigunguCode: '11710', roadCode: null, mainNoText: '00038' }), null);
    assert.equal(roadKeyOf({ sigunguCode: '11710', roadCode: '3123019', mainNoText: '00000' }), null);
  });

  test('지번 읽기: "232" · "202-3" · "산12-3"', () => {
    assert.deepEqual(parseJibun('232'), { isMountain: false, mainLot: 232, subLot: 0 });
    assert.deepEqual(parseJibun('202-3'), { isMountain: false, mainLot: 202, subLot: 3 });
    assert.deepEqual(parseJibun('산12-3'), { isMountain: true, mainLot: 12, subLot: 3 });
    assert.equal(parseJibun(''), null);
    assert.equal(parseJibun('가나'), null);
  });

  test('법정동: 매매는 sggCd + umdCd, 전월세는 그 시군구에서 umdNm 이 같은 Region', () => {
    const { regionIdByDong } = buildLinkIndex({ regions: REGIONS });
    assert.equal(legalDongCodeOf(trades[0], regionIdByDong), '1171010100');
    assert.equal(legalDongCodeOf(rents[0], regionIdByDong), '1171010300'); // 풍납동
    assert.equal(legalDongCodeOf({ ...rents[0], umdName: '없는동' }, regionIdByDong), null);
    assert.equal(dealLotKey(trades[0], '1171010100'), '1171010100|0|35|0'); // 본번 0035 · 부번 0000
    assert.equal(dealLotKey(rents[2], '1171010300'), '1171010300|0|413|1'); // 지번 "413-1"
  });
});

describe('잇기 순서 — 도로명 → 지번 → aptSeq', () => {
  const complexes = [
    { id: 'c-road', sourceKey: 'ROAD:117103123015-0-62-0', regionId: '1171010100' }, // 트리지움 도로명
    { id: 'c-lot', sourceKey: 'DBTEST:x', regionId: '1171010100', isMountain: false, mainLot: 27, subLot: 0 }, // 주공5단지 지번(잠실동 27)
    { id: 'c-cols', sourceKey: null, regionId: '1171010300', roadCode: '117103123019', isUnderground: false, buildingMainNo: 38, buildingSubNo: 6 }, // sourceKey 없이 도로명 칸만
  ];

  test('도로명 키 · 지번 · 단지 칸으로 만든 도로명 키 · 못 잇기', () => {
    const index = buildLinkIndex({ complexes, regions: REGIONS });
    const linked = linkDeals([trades[0], trades[1], rents[0], trades[2]], index);
    assert.deepEqual(
      linked.map((deal) => [deal.aptName, deal.complexId, deal.linkMethod]),
      [
        ['트리지움', 'c-road', 'ROAD'],
        ['주공아파트 5단지', 'c-lot', 'JIBUN'],
        ['한강극동', 'c-cols', 'ROAD'],
        ['헬리오시티', null, null], // 우리 단지가 아님 — complexId null(동 시세에만)
      ],
    );
    assert.equal(linked[3].legalDongCode, '1171010700'); // 매매는 Region 목록 없이도 sggCd + umdCd(가락동)
  });

  test('aptSeq: 도로명 · 지번으로 이어진 거래의 단지 일련번호와 같으면 같은 단지(도로명 번호가 다른 동도)', () => {
    const otherBuilding = { ...trades[0], road: { ...trades[0].road, mainNoText: '00064' }, mainLotText: null, jibun: null };
    const index = buildLinkIndex({ complexes, regions: REGIONS });
    const linked = linkDeals([otherBuilding, trades[0]], index);
    assert.deepEqual(linked.map((deal) => [deal.complexId, deal.linkMethod]), [['c-road', 'APT_SEQ'], ['c-road', 'ROAD']]);
    // 앞서 배운 것(hints)으로도
    const fromHints = linkDeals([otherBuilding], buildLinkIndex({ complexes: [], regions: REGIONS, aptSeqHints: [['11710-6028', 'c-road']] }));
    assert.equal(fromHints[0].complexId, 'c-road');
  });

  test('같은 도로명주소의 다른 단지(해운대자이 1 · 2단지 모양): 양쪽 지번이 다르면 도로명으로 잇지 않고 지번으로 넘어간다', () => {
    const road = roadKeyOf(trades[0].road); // 트리지움 도로명(잠실로 62) — 지번 잠실동 35
    const xi1 = { id: 'xi1', sourceKey: road, regionId: '1171010100', mainLot: 35, subLot: 0, isMountain: false };
    const xi2 = { id: 'xi2', sourceKey: 'DBTEST:xi2', regionId: '1171010100', mainLot: 37, subLot: 0, isMountain: false };
    const sameLot = trades[0];
    const otherLot = { ...trades[0], mainLotText: '0037', aptSeq: '11710-9999' }; // 같은 도로명 · 다른 지번(2단지)
    const noLot = { ...trades[0], mainLotText: null, subLotText: null, jibun: null, aptSeq: '11710-8888' }; // 거래에 지번이 없음
    const onlyXi1 = linkDeals([sameLot, otherLot, noLot], buildLinkIndex({ complexes: [xi1], regions: REGIONS }));
    assert.deepEqual(onlyXi1.map((deal) => [deal.complexId, deal.linkMethod]), [['xi1', 'ROAD'], [null, null], ['xi1', 'ROAD']]);
    const both = linkDeals([sameLot, otherLot], buildLinkIndex({ complexes: [xi1, xi2], regions: REGIONS }));
    assert.deepEqual(both.map((deal) => [deal.complexId, deal.linkMethod]), [['xi1', 'ROAD'], ['xi2', 'JIBUN']]);
    // 우리 단지 쪽에 지번이 없으면 도로명으로 잇는다(한쪽만 있으면 비교하지 않음)
    const xi1NoLot = { id: 'xi1', sourceKey: road, regionId: '1171010100' };
    assert.equal(linkDeals([otherLot], buildLinkIndex({ complexes: [xi1NoLot], regions: REGIONS }))[0].complexId, 'xi1');
    // 저장된 키로 다시 이을 때도 같다
    const index = buildLinkIndex({ complexes: [xi1, xi2], regions: REGIONS });
    assert.deepEqual(linkStoredKeys({ roadKey: road, lotKey: '1171010100|0|37|0', aptSeq: null }, index), { complexId: 'xi2', linkMethod: 'JIBUN' });
    assert.deepEqual(linkStoredKeys({ roadKey: road, lotKey: null, aptSeq: null }, index), { complexId: 'xi1', linkMethod: 'ROAD' });
    assert.deepEqual(
      linkStoredKeys({ roadKey: road, lotKey: '1171010100|0|39|0', aptSeq: null }, buildLinkIndex({ complexes: [xi1], regions: REGIONS })),
      { complexId: null, linkMethod: null },
    );
  });

  test('겹치는 키(같은 지번의 단지 둘 · 두 단지로 가는 aptSeq)는 쓰지 않는다', () => {
    const twins = [
      { id: 'a', regionId: '1171010100', mainLot: 27, subLot: 0 },
      { id: 'b', regionId: '1171010100', mainLot: 27, subLot: 0 },
    ];
    assert.equal(linkDeals([trades[1]], buildLinkIndex({ complexes: twins, regions: REGIONS }))[0].complexId, null);
    const hints = [['11710-6028', 'a'], ['11710-6028', 'b']];
    assert.equal(linkDeals([trades[0]], buildLinkIndex({ regions: REGIONS, aptSeqHints: hints }))[0].complexId, null);
  });

  test('저장된 키로 다시 잇기도 같은 순서', () => {
    const index = buildLinkIndex({ complexes, regions: REGIONS, aptSeqHints: [['11710-9', 'c-lot']] });
    assert.deepEqual(linkStoredKeys({ roadKey: 'ROAD:117103123015-0-62-0', lotKey: '1171010100|0|27|0', aptSeq: null }, index), { complexId: 'c-road', linkMethod: 'ROAD' });
    assert.deepEqual(linkStoredKeys({ roadKey: 'ROAD:1-0-1-0', lotKey: '1171010100|0|27|0', aptSeq: null }, index), { complexId: 'c-lot', linkMethod: 'JIBUN' });
    assert.deepEqual(linkStoredKeys({ roadKey: null, lotKey: null, aptSeq: '11710-9' }, index), { complexId: 'c-lot', linkMethod: 'APT_SEQ' });
    assert.deepEqual(linkStoredKeys({ roadKey: null, lotKey: null, aptSeq: null }, index), { complexId: null, linkMethod: null });
  });
});

describe('도로명 키가 건물 번호까지 같고 이름이 맞으면 지번이 달라도 잇는다(#270 — 중계그린 실제 거래 8건)', () => {
  const green = parseRtmsXml(JUNGGYE_GREEN_XML).items.map((item) => normalizeItem('TRADE', item));
  const NOWON = [{ id: '1135010600', dongName: '중계동' }];
  // 주소 검색의 세 줄 가운데 하나로 등록한 우리 단지(이름은 juso 건물명 그대로)
  const complexOf = (line, extra = {}) => ({ id: `c-${line}`, regionId: '1135010600', isMountain: false, name: '중계그린아파트', buildingName: '중계그린아파트', ...JUNGGYE_GREEN_LINES[line], ...extra });
  const roadNoOf = (deal) => `${deal.road.roadCode === '4130202' ? '동일로207길' : '섬밭로'} ${Number(deal.road.mainNoText)}`;
  const linkAll = (complex, extra = {}) => linkDeals(green, buildLinkIndex({ complexes: [complex], regions: NOWON, ...extra }));
  const methodsByRoad = (linked) => {
    const out = {};
    for (const deal of linked) {
      const key = roadNoOf(deal);
      out[key] ??= new Set();
      out[key].add(`${deal.complexId ?? '-'} ${deal.linkMethod ?? '-'}`);
    }
    return Object.fromEntries(Object.entries(out).map(([key, set]) => [key, [...set].sort().join(' / ')]));
  };

  test('고정 데이터: 한 단지(11350-120) · 지번 502-1 · 도로명 세 가지', () => {
    assert.equal(green.length, 8);
    assert.ok(green.every((deal) => deal.aptSeq === '11350-120' && dealLotKey(deal, '1135010600') === '1135010600|0|502|1'));
    assert.deepEqual([...new Set(green.map(roadNoOf))].sort(), ['동일로207길 17', '동일로207길 18', '섬밭로 285']);
    assert.equal(roadKeyOf(green[2].road), JUNGGYE_GREEN_LINES.road17.sourceKey);
  });

  test('17번지 줄(503)로 등록: 동일로207길 17 거래가 이름 확인으로(ROAD) 이어지고, 일련번호로 18 · 섬밭로 285 거래도 이어진다', () => {
    assert.deepEqual(methodsByRoad(linkAll(complexOf('road17'))), {
      '동일로207길 17': 'c-road17 ROAD',
      '동일로207길 18': 'c-road17 APT_SEQ',
      '섬밭로 285': 'c-road17 APT_SEQ',
    });
  });

  test('18번지 줄(502-1)로 등록: 지금처럼 — 18 번지는 도로명, 나머지는 지번으로(바뀌지 않음)', () => {
    assert.deepEqual(methodsByRoad(linkAll(complexOf('road18'))), {
      '동일로207길 17': 'c-road18 JIBUN',
      '동일로207길 18': 'c-road18 ROAD',
      '섬밭로 285': 'c-road18 JIBUN',
    });
  });

  test('섬밭로 285 줄(504-1)로 등록: 섬밭로 285 거래가 이름 확인으로 이어지고, 일련번호로 나머지도 이어진다', () => {
    assert.deepEqual(methodsByRoad(linkAll(complexOf('road285'))), {
      '동일로207길 17': 'c-road285 APT_SEQ',
      '동일로207길 18': 'c-road285 APT_SEQ',
      '섬밭로 285': 'c-road285 ROAD',
    });
  });

  test('한쪽에만 번호가 있는데 그 동에 1 · 2단지가 다 있으면 막힌다(어느 쪽인지 모름)', () => {
    const dealNames = [{ legalDongCode: '1135010600', aptName: '중계그린2단지' }]; // 저장된 거래 이름에 2단지도 있다
    const linked = linkAll(complexOf('road17'), { dealNames });
    assert.ok(linked.every((deal) => deal.complexId === null));
    // 우리 단지 이름에도 번호가 있으면 번호까지 같아야 — 1단지면 이어지고 2단지면 막힌다
    assert.equal(linkAll(complexOf('road17', { name: '중계그린1단지', buildingName: null }), { dealNames }).every((deal) => deal.complexId === 'c-road17'), true);
    assert.ok(linkAll(complexOf('road17', { name: '중계그린2단지', buildingName: null }), { dealNames }).every((deal) => deal.complexId === null));
  });

  test('도로명 키가 같아도 이름이 아예 다르면 막힌다(지금 그대로)', () => {
    assert.ok(linkAll(complexOf('road17', { name: '중계주공아파트', buildingName: '중계주공아파트' })).every((deal) => deal.complexId === null));
    // 이름 정규화는 띄어쓰기 · 끝의 "아파트" 만 — 차수 · 괄호는 떼지 않는다
    assert.equal(normalizeComplexName(' 중계 그린 아파트 '), '중계그린');
    assert.equal(normalizeComplexName('현대6차아파트'), '현대6차');
    assert.equal(normalizeComplexName('양지마을(대림)1'), '양지마을(대림)1');
    assert.equal(sameComplexName(['현대아파트'], '현대6차', '1', new Map()), false);
    assert.equal(sameComplexName(['양지마을'], '양지마을(대림)1', '1', new Map()), false);
  });

  test('도로명 본번은 같은데 건물 부번이 다르면 막힌다(도로명 키가 정확히 같을 때만 예외)', () => {
    assert.ok(linkAll(complexOf('road17', { sourceKey: 'ROAD:113504130202-0-17-1' })).every((deal) => deal.complexId === null));
  });

  test('해운대자이 1 · 2단지: 같은 도로명주소 · 다른 지번 · 번호가 다른 이름 — 지금처럼 2단지 거래는 1단지에 안 이어진다', () => {
    const road = roadKeyOf(trades[0].road);
    const xi1 = { id: 'xi1', sourceKey: road, regionId: '1171010100', mainLot: 35, subLot: 0, isMountain: false, name: '해운대자이1단지' };
    const xi2Deal = { ...trades[0], mainLotText: '0037', aptSeq: '11710-9999', aptName: '해운대자이2단지' };
    const xi1Deal = { ...trades[0], aptName: '해운대자이1단지' };
    const linked = linkDeals([xi1Deal, xi2Deal], buildLinkIndex({ complexes: [xi1], regions: REGIONS }));
    assert.deepEqual(linked.map((deal) => [deal.aptName, deal.complexId, deal.linkMethod]), [['해운대자이1단지', 'xi1', 'ROAD'], ['해운대자이2단지', null, null]]);
  });

  test('다시 잇기(complexId null 인 저장 거래)도 같은 결과 — 이름 확인으로 잇고, 배운 일련번호로 나머지를 잇는다', () => {
    const stored = green.map((deal) => ({ roadKey: roadKeyOf(deal.road), lotKey: dealLotKey(deal, '1135010600'), aptSeq: deal.aptSeq, aptName: deal.aptName, legalDongCode: '1135010600' }));
    const relinkLike = (complex, extra = {}) => {
      // relinkSigungu 와 같은 흐름: 도로명 · 지번 후보 먼저(이어지면 일련번호를 배움), 그다음 일련번호 후보
      const index = buildLinkIndex({ complexes: [complex], regions: NOWON, ...extra });
      const result = stored.map((row) => {
        const linked = linkStoredKeys({ ...row, aptSeq: null }, index);
        if (linked.complexId && row.aptSeq && !index.byAptSeq.has(row.aptSeq)) index.byAptSeq.set(row.aptSeq, linked.complexId);
        return linked;
      });
      return result.map((linked, i) => (linked.complexId ? linked : linkStoredKeys({ roadKey: null, lotKey: null, aptSeq: stored[i].aptSeq }, index)));
    };
    const byRoad = (results) => Object.fromEntries(green.map((deal, i) => [roadNoOf(deal), `${results[i].complexId ?? '-'} ${results[i].linkMethod ?? '-'}`]));
    assert.deepEqual(byRoad(relinkLike(complexOf('road17'))), { '동일로207길 17': 'c-road17 ROAD', '동일로207길 18': 'c-road17 APT_SEQ', '섬밭로 285': 'c-road17 APT_SEQ' });
    assert.deepEqual(byRoad(relinkLike(complexOf('road285'))), { '동일로207길 17': 'c-road285 APT_SEQ', '동일로207길 18': 'c-road285 APT_SEQ', '섬밭로 285': 'c-road285 ROAD' });
    assert.deepEqual(byRoad(relinkLike(complexOf('road18'))), { '동일로207길 17': 'c-road18 JIBUN', '동일로207길 18': 'c-road18 ROAD', '섬밭로 285': 'c-road18 JIBUN' });
    // 1 · 2단지가 다 있으면 다시 잇기도 막힌다
    const dealNames = [{ legalDongCode: '1135010600', aptName: '중계그린2단지' }, { legalDongCode: '1135010600', aptName: '중계그린1단지' }];
    assert.ok(relinkLike(complexOf('road17'), { dealNames }).every((linked) => linked.complexId === null));
  });
});

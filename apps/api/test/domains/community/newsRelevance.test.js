// 뉴스 걸러내기(DB·네트워크 없음).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildNameIndex, buildRegionTerms, getSido, hasRealEstateWord, makeTitleFilter, toQueryName } from '../../../src/domains/community/newsRelevance.js';

// Region 일부만 흉내 낸 표. 중구는 서울(11)·부산(26) 두 곳에, 신천동은 송파구·대구 동구 두 곳에 있다.
const REGIONS = [
  { legalDongCode: '1171010100', sigunguName: '송파구', dongName: '잠실동' },
  { legalDongCode: '1171010200', sigunguName: '송파구', dongName: '신천동' },
  { legalDongCode: '1171010500', sigunguName: '송파구', dongName: '삼전동' },
  { legalDongCode: '1171011100', sigunguName: '송파구', dongName: '방이동' },
  { legalDongCode: '2714010100', sigunguName: '동구', dongName: '신천동' },
  { legalDongCode: '2614010100', sigunguName: '동구', dongName: '초량동' },
  { legalDongCode: '1114010100', sigunguName: '중구', dongName: '무교동' },
  { legalDongCode: '2611010100', sigunguName: '중구', dongName: '중앙동' },
  { legalDongCode: '2635010500', sigunguName: '해운대구', dongName: '우동' },
  { legalDongCode: '4111110100', sigunguName: '수원시 장안구', dongName: '파장동' },
];
const index = buildNameIndex(REGIONS);
const sigunguFilter = (sigunguName, dongNames, sidoCode) =>
  makeTitleFilter({ scope: 'SIGUNGU', terms: buildRegionTerms({ sigunguName, dongNames }, index), sidoCode });

describe('부동산 낱말', () => {
  test('하나라도 있으면 통과, 없으면 탈락', () => {
    assert.equal(hasRealEstateWord('잠실 전세 매물 두 달 만에 증가'), true);
    assert.equal(hasRealEstateWord('공시가격 오르자 보유세 부담'), true);
    assert.equal(hasRealEstateWord('송파구 축제 개막'), false);
  });

  test('"임대"·"임차"·"매매" 단독은 탈락, 좁힌 낱말은 통과', () => {
    assert.equal(hasRealEstateWord('지하철 차량 임대 계약 체결'), false);
    assert.equal(hasRealEstateWord('인신매매 조직 검거'), false);
    assert.equal(hasRealEstateWord('주택임대차보호법 개정'), true);
    assert.equal(hasRealEstateWord('임대인 의무 강화'), true);
    assert.equal(hasRealEstateWord('잠실 매매가 하락'), true);
  });

  test('전국: 부동산 낱말만 본다', () => {
    const nationwide = makeTitleFilter({ scope: 'NATIONWIDE' });
    assert.equal(nationwide('국토교통부, 전세사기 대책 발표'), true);
    assert.equal(nationwide('국토교통부 장관 해외 출장'), false);
  });
});

describe('지역 이름', () => {
  const songpa = sigunguFilter('송파구', ['잠실동', '신천동', '삼전동', '방이동'], '11');

  test('"송파구" 와 "송파" 둘 다 인정(부동산 낱말도 있어야)', () => {
    assert.equal(songpa('송파구 아파트값 상승'), true);
    assert.equal(songpa('송파 재건축 단지 분양'), true);
    assert.equal(songpa('송파구 축제 개막'), false); // 부동산 낱말 없음
    assert.equal(songpa('강남 아파트값 상승'), false); // 지역 이름 없음
  });

  test('그 시·군·구의 모든 법정동 이름 — 전국에 하나뿐인 이름(잠실)은 혼자서도', () => {
    assert.equal(songpa('잠실 전세 매물 증가'), true);
    assert.equal(songpa('잠실동 집주인 보증금 반환'), true);
  });

  test('여러 곳에 있는 동 이름(신천)은 구 이름이나 시·도 이름이 함께일 때만', () => {
    assert.equal(songpa('신천 전세 매물 증가'), false);
    assert.equal(songpa('송파 신천 전세 매물 증가'), true);
    assert.equal(songpa('서울 신천동 아파트 거래'), true);
    assert.equal(songpa('대구 신천동 아파트 거래'), false);
  });

  test('제외 목록(삼전·방이)은 뗀 이름만 빼고 전체 이름은 인정', () => {
    assert.equal(songpa('삼전 주가에 아파트 대출 몰려'), false);
    assert.equal(songpa('방이 3개 아파트 인기'), false);
    assert.equal(songpa('삼전동 빌라 전세'), true);
    assert.equal(songpa('방이동 아파트 재건축'), true);
  });

  test('여러 시·도에 있는 이름(중구)은 시·도 이름과 함께일 때만', () => {
    const seoulJung = sigunguFilter('중구', [], '11');
    assert.equal(seoulJung('중구 아파트 재개발'), false);
    assert.equal(seoulJung('서울 중구 아파트 재개발'), true);
    assert.equal(seoulJung('부산 중구 아파트 재개발'), false);
    const term = buildRegionTerms({ sigunguName: '중구', dongNames: [] }, index);
    assert.deepEqual(term, [{ term: '중구', kind: 'SIGUNGU', context: 'SIDO' }]); // "중" 한 글자는 쓰지 않는다
  });

  test('띄어 쓴 시·군·구는 낱말마다(수원시 장안구 → 수원·장안)', () => {
    const jangan = sigunguFilter('수원시 장안구', [], '41');
    assert.equal(jangan('수원 아파트 청약 경쟁'), true);
    assert.equal(jangan('장안구 전세 매물'), true);
  });
});

describe('검색어 이름', () => {
  test('뗀 이름이 전국에 하나뿐이면 그것, 아니면 전체 이름', () => {
    assert.equal(toQueryName('송파구', 'SIGUNGU', index), '송파');
    assert.equal(toQueryName('중구', 'SIGUNGU', index), '중구');
    assert.equal(toQueryName('잠실동', 'DONG', index), '잠실');
    assert.equal(toQueryName('신천동', 'DONG', index), '신천동');
    assert.equal(toQueryName('우동', 'DONG', index), '우동');
    assert.equal(toQueryName('삼전동', 'DONG', index), '삼전동');
    assert.equal(toQueryName('수원시 장안구', 'SIGUNGU', index), '장안');
  });
});

describe('시·도', () => {
  test('약칭(또는 정식 이름)이 제목에 있고 부동산 낱말도 있어야', () => {
    const seoul = makeTitleFilter({ scope: 'SIDO', sidoCode: '11' });
    assert.equal(seoul('서울 아파트 전세가 상승'), true);
    assert.equal(seoul('부산 아파트 전세가 상승'), false);
    assert.equal(seoul('서울 지하철 파업'), false);
    const chungbuk = makeTitleFilter({ scope: 'SIDO', sidoCode: '43' });
    assert.equal(chungbuk('충청북도 공시가격 발표'), true);
  });

  test('17개 시·도 표 — 새 코드(전남광주통합특별시 12)는 광주·전남 둘 다', () => {
    assert.deepEqual(getSido('12').label.split('·'), ['광주', '전남']);
    const gwangju = makeTitleFilter({ scope: 'SIDO', sidoCode: '12' });
    assert.equal(gwangju('광주 아파트 분양'), true);
    assert.equal(gwangju('전남 임대차 분쟁'), true);
    assert.equal(getSido('99'), null);
  });
});

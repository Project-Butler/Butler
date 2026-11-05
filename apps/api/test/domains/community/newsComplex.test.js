// 우리 단지 뉴스 — 검색어 · 제목 거르기 · 규칙 파일(DB·네트워크 없음).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import cronRouter from '../../../src/domains/community/cronRouter.js';
import { buildFeedUrl, toQueries } from '../../../src/domains/community/newsProvider.js';
import { complexNameForms, makeComplexTitleFilter, toComplexQueryNames } from '../../../src/domains/community/newsRelevance.js';
import { COMPLEX_MAX_PER_RUN, COMPLEX_MAX_QUERIES, PERIOD_BY_SCOPE, SCHEDULE } from '../../../src/domains/community/newsRules.js';
import { orderComplexesForRun } from '../../../src/domains/community/service/news.js';

describe('규칙 파일', () => {
  test('SCHEDULE 의 경로가 cron 라우터에 걸린 경로와 같다', () => {
    const paths = cronRouter.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
    assert.deepEqual(paths.sort(), [SCHEDULE.news.path, SCHEDULE.polls.path].sort());
    assert.equal(SCHEDULE.news.path, '/api/cron/community-news');
    assert.equal(SCHEDULE.polls.path, '/api/cron/community-polls');
  });

  test('단지 기사는 최근 30일, 전국은 7일 그대로', () => {
    assert.equal(PERIOD_BY_SCOPE.COMPLEX, 'when:30d');
    assert.equal(PERIOD_BY_SCOPE.SIGUNGU, 'when:30d');
    assert.equal(PERIOD_BY_SCOPE.NATIONWIDE, 'when:7d');
  });
});

describe('단지 이름', () => {
  test('띄어쓰기를 없애고 "아파트" 를 뗀 이름을 따로 둔다', () => {
    assert.deepEqual(complexNameForms('잠실 엘스'), { full: '잠실엘스', base: '잠실엘스' });
    assert.deepEqual(complexNameForms('레이크팰리스아파트'), { full: '레이크팰리스아파트', base: '레이크팰리스' });
    // 이름 전체가 "아파트" 면 떼지 않는다
    assert.deepEqual(complexNameForms('아파트'), { full: '아파트', base: '아파트' });
  });

  test('검색어 이름: 그대로 + 뗀 이름(3자 이상이고 다를 때만)', () => {
    assert.deepEqual(toComplexQueryNames('잠실엘스'), ['잠실엘스']);
    assert.deepEqual(toComplexQueryNames('레이크팰리스아파트'), ['레이크팰리스아파트', '레이크팰리스']);
    // 뗀 이름이 두 글자면 검색어로 쓰지 않는다(너무 넓다)
    assert.deepEqual(toComplexQueryNames('현대아파트'), ['현대아파트']);
  });

  test('COMPLEX 검색어는 따옴표로 묶고 최대 COMPLEX_MAX_QUERIES 개, 기간은 when:30d', () => {
    const queries = toQueries({ scope: 'COMPLEX', complexQueryNames: ['레이크팰리스아파트', '레이크팰리스', '여분'] });
    assert.equal(queries.length, COMPLEX_MAX_QUERIES);
    assert.deepEqual(queries, ['"레이크팰리스아파트"', '"레이크팰리스"']);
    const url = new URL(buildFeedUrl(queries[1], 'COMPLEX'));
    assert.equal(url.searchParams.get('q'), '"레이크팰리스" when:30d');
    assert.equal(url.searchParams.get('hl'), 'ko');
    assert.deepEqual(toQueries({ scope: 'COMPLEX' }), []);
  });
});

describe('단지 순서', () => {
  const complexes = ['c-recent', 'c-old', 'c-new-b', 'c-new-a', 'c-older'].map((id) => ({ id }));
  const lastCollected = new Map([
    ['c-recent', new Date('2026-11-05T00:00:00Z')],
    ['c-old', new Date('2026-10-01T00:00:00Z')],
    ['c-older', new Date('2026-09-01T00:00:00Z')],
  ]);

  test('한 번도 안 모은 단지(id 순) → 오래전에 모은 단지 → 최근에 모은 단지', () => {
    assert.deepEqual(
      orderComplexesForRun(complexes, lastCollected).map((row) => row.id),
      ['c-new-a', 'c-new-b', 'c-older', 'c-old', 'c-recent'],
    );
  });

  test('한 번에 limit 곳까지 — 남은 단지는 다음 실행에 앞으로 온다', () => {
    assert.equal(COMPLEX_MAX_PER_RUN, 30);
    const first = orderComplexesForRun(complexes, lastCollected, 2).map((row) => row.id);
    assert.deepEqual(first, ['c-new-a', 'c-new-b']);
    // 첫 실행에서 돈 두 곳에 시각이 찍히면 다음 실행은 나머지부터
    const after = new Map([...lastCollected, ...first.map((id) => [id, new Date('2026-11-06T00:00:00Z')])]);
    assert.deepEqual(orderComplexesForRun(complexes, after, 2).map((row) => row.id), ['c-older', 'c-old']);
  });
});

describe('단지 기사 거르기', () => {
  const elsFilter = makeComplexTitleFilter({ name: '잠실엘스', dongName: '잠실동', sigunguName: '송파구' });

  test('전국에 하나뿐인 이름: 이름 + 부동산 낱말이면 통과', () => {
    assert.equal(elsFilter('잠실엘스 전용 84㎡ 실거래 30억 돌파'), true);
    assert.equal(elsFilter('잠실엘스 단지 내 어린이 축제'), false);
    assert.equal(elsFilter('송파 아파트 전세 상승'), false);
  });

  test('띄어 쓴 제목도 같은 이름으로 본다', () => {
    assert.equal(elsFilter('잠실 엘스 전세 매물 감소'), true);
  });

  test('이름 안의 "아파트" 는 부동산 낱말로 치지 않는다', () => {
    const filter = makeComplexTitleFilter({ name: '레이크팰리스아파트', dongName: '잠실동', sigunguName: '송파구' });
    assert.equal(filter('레이크팰리스아파트 입주민 음악회'), false);
    assert.equal(filter('레이크팰리스아파트 재건축 추진'), true);
    // 뗀 이름만 나와도 통과
    assert.equal(filter('레이크팰리스 전세 신고가'), true);
  });

  test('흔한 이름(같은 이름 단지가 여럿): 시·군·구나 동 이름이 함께 있어야 한다', () => {
    const filter = makeComplexTitleFilter({ name: '한신아파트', sameNameCount: 4, dongName: '우동', sigunguName: '해운대구' });
    assert.equal(filter('한신아파트 재건축 조합 설립'), false);
    assert.equal(filter('해운대 한신아파트 재건축 조합 설립'), true);
    assert.equal(filter('우동 한신아파트 전세 급등'), true);
    // 다른 지역 이름이 붙은 같은 이름 단지는 탈락
    assert.equal(filter('서초 한신아파트 재건축 조합 설립'), false);
  });

  test('짧은 이름(뗀 이름 두 글자): 시·군·구나 동 이름이 함께 있어야 한다', () => {
    const filter = makeComplexTitleFilter({ name: '현대아파트', dongName: '잠실동', sigunguName: '송파구' });
    assert.equal(filter('현대 아파트 분양 일정'), false);
    assert.equal(filter('송파 현대아파트 리모델링 재건축 검토'), true);
  });

  test('이름 안의 동 이름은 지역 이름으로 치지 않는다', () => {
    const filter = makeComplexTitleFilter({ name: '잠실엘스', sameNameCount: 2, dongName: '잠실동', sigunguName: '송파구' });
    assert.equal(filter('잠실엘스 전세 매물 감소'), false);
    assert.equal(filter('송파 잠실엘스 전세 매물 감소'), true);
  });

  test('이름 뒤에 숫자가 오면(차수 · 단지 번호) 다른 단지 — 띄어 써도 같다', () => {
    const filter = makeComplexTitleFilter({ name: '잠실우성아파트', dongName: '잠실동', sigunguName: '송파구' });
    assert.equal(filter('잠실우성아파트, 재건축 추정비례율 91.07%로 추산'), true);
    assert.equal(filter('잠실우성4차A 재건축 심의 통과… 49층 828세대 건립'), false);
    assert.equal(filter('송파 잠실우성 4차, 재건축 통해 828가구 새 아파트로'), false);
  });

  test('이름이 다른 낱말 중간에서 시작하면 다른 이름 — "일원개포한신" · "위한 신속" 은 "한신" 이 아니다', () => {
    const filter = makeComplexTitleFilter({ name: '한신아파트', dongName: '일원동', sigunguName: '강남구' });
    assert.equal(filter('강남구 일원개포한신아파트 재건축 이주'), false);
    assert.equal(filter('강남구, 노후 임대주택 안전 확보 위한 신속 재정비'), false);
    assert.equal(filter('강남구 일원동 한신아파트 재건축 이주'), true);
    // 따옴표 · 문장부호 뒤는 낱말 처음
    assert.equal(filter("강남 '한신아파트' 재건축 이주"), true);
  });

  test('제외 낱말("삼전" · "방이")은 지역 이름으로 치지 않는다', () => {
    const filter = makeComplexTitleFilter({ name: '현대아파트', dongName: '삼전동', sigunguName: '송파구' });
    assert.equal(filter('삼전 현대아파트 재건축'), false);
    assert.equal(filter('삼전동 현대아파트 재건축'), true);
  });
});

// 통합 검색어 해석과 요청 검사(#172). DB 없이 순수 함수만 본다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSearchQuery } from '../../../src/domains/search/controller.js';
import {
  includesAllKeywords,
  interpretQuery,
  keywordsWhere,
  SEARCH_TYPES,
  splitQuery,
  tokenMatchesProperty,
} from '../../../src/domains/search/searchQuery.js';

const property = (id, name, buildingNo, unitNo) => ({ id, buildingNo, unitNo, complex: { name } });
const ELS_101 = property('p1', '잠실엘스', '101', '101');
const ELS_102 = property('p2', '잠실엘스', '102', '1203');
const PARK = property('p3', '헬리오시티', '', '410');

test('splitQuery: 공백으로 나누고 같은 단어는 한 번만', () => {
  assert.deepEqual(splitQuery('  101호   보일러 보일러 '), ['101호', '보일러']);
  assert.deepEqual(splitQuery('Abc abc'), ['Abc']);
});

test('tokenMatchesProperty: 동·호·숫자·단지명', () => {
  assert.equal(tokenMatchesProperty('101호', ELS_101), true);
  assert.equal(tokenMatchesProperty('101동', ELS_101), true);
  assert.equal(tokenMatchesProperty('101호', ELS_102), false);
  assert.equal(tokenMatchesProperty('1203', ELS_102), true);
  assert.equal(tokenMatchesProperty('엘스', ELS_102), true);
  assert.equal(tokenMatchesProperty('보일러', ELS_101), false);
  // 동이 없는 건물에 '동' 단어는 맞지 않는다
  assert.equal(tokenMatchesProperty('410동', PARK), false);
  assert.equal(tokenMatchesProperty('410호', PARK), true);
  // 한글 동 이름('가동')은 숫자가 아니라 단지명으로만 본다
  assert.equal(tokenMatchesProperty('가동', ELS_101), false);
});

test('interpretQuery: 호실 조건과 키워드를 나눈다', () => {
  const result = interpretQuery('101호 보일러', [ELS_101, ELS_102, PARK]);
  assert.deepEqual(result.scopeTokens, ['101호']);
  assert.deepEqual(result.keywords, ['보일러']);
  assert.deepEqual(result.scopedPropertyIds, ['p1']);
});

test('interpretQuery: 호실 조건은 모두 맞아야 한다', () => {
  assert.deepEqual(interpretQuery('잠실 1203호', [ELS_101, ELS_102]).scopedPropertyIds, ['p2']);
  assert.deepEqual(interpretQuery('101동 1203호', [ELS_101, ELS_102]).scopedPropertyIds, []);
});

test('interpretQuery: 호실 조건이 없으면 호실 제한 없음', () => {
  const result = interpretQuery('보일러 영수증', [ELS_101]);
  assert.equal(result.scopedPropertyIds, null);
  assert.deepEqual(result.keywords, ['보일러', '영수증']);
});

test('includesAllKeywords: 대소문자 무시, 모두 포함', () => {
  assert.equal(includesAllKeywords('계약 만기', ['만기']), true);
  assert.equal(includesAllKeywords('계약 만기', ['만기', '월세']), false);
  assert.equal(includesAllKeywords('Receipt.JPG', ['jpg']), true);
  assert.equal(includesAllKeywords(null, []), true);
});

test('keywordsWhere: 키워드마다 필드 중 하나', () => {
  assert.deepEqual(keywordsWhere([], ['title']), {});
  assert.deepEqual(keywordsWhere(['a', 'b'], ['title', 'content']), {
    AND: [
      { OR: [{ title: { contains: 'a', mode: 'insensitive' } }, { content: { contains: 'a', mode: 'insensitive' } }] },
      { OR: [{ title: { contains: 'b', mode: 'insensitive' } }, { content: { contains: 'b', mode: 'insensitive' } }] },
    ],
  });
});

const assertInvalid = (fn, field) =>
  assert.throws(fn, (error) => error.code === 'VALIDATION_ERROR' && error.details.some((item) => item.field === field));

test('parseSearchQuery: query 길이', () => {
  assertInvalid(() => parseSearchQuery({}), 'query');
  assertInvalid(() => parseSearchQuery({ query: ' 가 ' }), 'query');
  assertInvalid(() => parseSearchQuery({ query: '가'.repeat(51) }), 'query');
  assert.equal(parseSearchQuery({ query: '  101호   보일러 ' }).query, '101호 보일러');
});

test('parseSearchQuery: types', () => {
  assert.deepEqual(parseSearchQuery({ query: '보일러' }).types, SEARCH_TYPES);
  assert.deepEqual(parseSearchQuery({ query: '보일러', types: '' }).types, SEARCH_TYPES);
  assert.deepEqual(parseSearchQuery({ query: '보일러', types: 'PROPERTY, DOCUMENT,PROPERTY' }).types, ['PROPERTY', 'DOCUMENT']);
  assertInvalid(() => parseSearchQuery({ query: '보일러', types: 'PROPERTY,PAYMENT' }), 'types');
  assertInvalid(() => parseSearchQuery({ query: '보일러', types: 'property' }), 'types');
  assertInvalid(() => parseSearchQuery({ query: ['a', 'b'] }), 'query');
});

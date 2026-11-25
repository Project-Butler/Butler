import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickRelated, rankBySimilarity, rankByWeightedOverlap, toRelatedQuery } from '../../../src/domains/disputes/related.js';

const candidate = (id, embedding) => ({ id, title: id, embedding });

test('관련 자료: 기준 임베딩과 가까운 순서로 limit개만 고르고 임베딩은 뺀다', () => {
  const candidates = [candidate('far', [0, 1]), candidate('near', [1, 0]), candidate('mid', [0.6, 0.8])];
  const ranked = rankBySimilarity([1, 0], candidates, 2);

  assert.deepEqual(
    ranked.map(({ id }) => id),
    ['near', 'mid'],
  );
  assert.ok(ranked.every((reference) => !('embedding' in reference)));
});

test('관련 자료: 후보가 limit보다 적으면 있는 만큼만', () => {
  assert.equal(rankBySimilarity([1, 0], [candidate('only', [1, 0])], 3).length, 1);
  assert.deepEqual(rankBySimilarity([1, 0], [], 3), []);
});

test('관련 자료 검색어: 키워드 먼저, 8개가 안 되면 제목 낱말로 채운다. 한글 두 글자 이상 든 낱말만, 최대 8개, 불용어는 세기 전에 뺀다', () => {
  assert.equal(toRelatedQuery({ keywords: ['보증금 반환', '반환일 연기'], title: '늦춘 사례 제목' }), '보증금 반환 반환일 연기 늦춘 사례 제목');
  assert.equal(toRelatedQuery({ keywords: ['하자'], title: '과세처분의 하자' }), '하자 과세처분의'); // 겹치는 말은 한 번
  assert.equal(toRelatedQuery({ keywords: [], title: '甲 등이 1. 임대차보증금 ■■■ 2020다226452 반환' }), '등이 임대차보증금 반환');
  assert.equal(toRelatedQuery({ keywords: ['가나 다라 마바 사아 자차 카타 파하 거너 더러 머버'] }).split(' ').length, 8);
  assert.equal(toRelatedQuery({ keywords: ['계속 거주'] }, { skip: (word) => word === '계속' }), '거주');
  assert.equal(toRelatedQuery({ keywords: [], title: '甲 ■' }), '');
  // 문장부호 정리 함수를 넘기면 그걸 먼저 거친다
  assert.equal(toRelatedQuery({ title: '(보증금)' }, { clean: (text) => text.replace(/[()]/g, ' ') }), '보증금');
});

test('관련 자료 고르기: 검색 결과 다음 대체 목록 순서로, 자기 자신·같은 제목·중복은 빼고 limit개', () => {
  const ref = (id, title) => ({ id, title });
  const picked = pickRelated({
    target: ref('me', '건물인도'),
    ranked: [ref('me', '건물인도'), ref('a', '건물인도'), ref('b', '차임 연체'), ref('c', '차임 연체')],
    fallback: [ref('b', '차임 연체'), ref('d', '원상회복'), ref('e', '보증금')],
    limit: 3,
  });
  assert.deepEqual(picked.map(({ id }) => id), ['b', 'd', 'e']);
  assert.deepEqual(pickRelated({ target: ref('me', 'x'), ranked: [], fallback: [], limit: 3 }), []);
});

test('겹치는 낱말 점수: 겹친 낱말 수가 같으면 드문 낱말이 겹친 자료가 앞, 기준 자료·안 겹친 자료는 빼고 size개', () => {
  // 낱말 0은 흔함(4건), 낱말 1은 드묾(2건). 전체 100건. 점수가 같으면 id 순
  const rows = [
    { id: 'me', flags: [1, 1] },
    { id: 'common-only-1', flags: [1, 0] },
    { id: 'common-only-2', flags: [1, 0] },
    { id: 'rare-only', flags: [0, 1] },
    { id: 'common-only-3', flags: [1, 0] },
  ];
  assert.deepEqual(rankByWeightedOverlap({ rows, total: 100, excludeId: 'me', size: 3 }), ['rare-only', 'common-only-1', 'common-only-2']);
  assert.deepEqual(rankByWeightedOverlap({ rows: [], total: 100, excludeId: 'me', size: 3 }), []);
  // 겹친 낱말 수가 먼저: 흔한 낱말 둘이 겹친 자료가 드문 낱말 하나만 겹친 자료보다 앞
  const counted = [
    { id: 'rare-one', flags: [0, 0, 1] },
    { id: 'common-two', flags: [1, 1, 0] },
    ...Array.from({ length: 40 }, (_, index) => ({ id: `filler-${index}`, flags: [1, 1, 0] })),
  ];
  assert.equal(rankByWeightedOverlap({ rows: counted, total: 100, excludeId: 'me', size: 50 }).at(-1), 'rare-one');
});

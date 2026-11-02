import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rankBySimilarity } from './related.js';

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

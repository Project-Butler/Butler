import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CURATED_PRECEDENT_KEYS } from '../../../src/domains/disputes/curatedPrecedents.js';

const PRECEDENTS_JSON = new URL('../../../prisma/seed-data/precedents.json', import.meta.url);

test('골라 둔 판례 목록은 챗봇용 판례(precedents.json)의 sourceKey와 같다', () => {
  const seedKeys = JSON.parse(readFileSync(PRECEDENTS_JSON, 'utf8')).map((reference) => reference.sourceKey);
  assert.deepEqual([...CURATED_PRECEDENT_KEYS].sort(), [...seedKeys].sort());
  assert.equal(new Set(CURATED_PRECEDENT_KEYS).size, CURATED_PRECEDENT_KEYS.length);
});

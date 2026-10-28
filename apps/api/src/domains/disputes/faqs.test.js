import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DisputeCategory } from '@prisma/client';
import { DISPUTE_FAQS, filterFaqs } from './faqs.js';

const referenceKeys = new Set(
  JSON.parse(readFileSync(new URL('../../../prisma/seed-data/disputes.json', import.meta.url), 'utf8')).map(
    (reference) => reference.sourceKey,
  ),
);

test('자주 묻는 질문: key가 겹치지 않고 질문·답이 비어 있지 않다', () => {
  assert.equal(new Set(DISPUTE_FAQS.map((faq) => faq.key)).size, DISPUTE_FAQS.length);
  for (const faq of DISPUTE_FAQS) {
    assert.ok(faq.question.trim().length > 0, faq.key);
    assert.ok(faq.answer.trim().length > 0, faq.key);
  }
});

test('자주 묻는 질문: 분쟁 유형은 DisputeCategory 값이다', () => {
  for (const faq of DISPUTE_FAQS) {
    assert.ok(Object.values(DisputeCategory).includes(faq.category), `${faq.key}: ${faq.category}`);
  }
});

test('자주 묻는 질문: 근거 자료(referenceKeys)는 모두 분쟁 참고자료 시드에 있다', () => {
  for (const faq of DISPUTE_FAQS) {
    assert.ok(faq.referenceKeys.length > 0, `${faq.key}: 근거 없음`);
    for (const key of faq.referenceKeys) assert.ok(referenceKeys.has(key), `${faq.key}: ${key}`);
  }
});

test('자주 묻는 질문 거르기: 유형 여러 개와 검색어(질문·답, 대소문자 무시)를 함께 적용한다', () => {
  const byCategory = filterFaqs({ categories: ['GENERAL', 'PREMIUM'], keyword: null });
  assert.ok(byCategory.length > 0);
  assert.ok(byCategory.every((faq) => ['GENERAL', 'PREMIUM'].includes(faq.category)));

  const byKeyword = filterFaqs({ categories: [], keyword: '도배' });
  assert.ok(byKeyword.length > 0);
  assert.ok(byKeyword.every((faq) => `${faq.question}${faq.answer}`.includes('도배')));

  assert.deepEqual(filterFaqs({ categories: ['REPAIR_DUTY'], keyword: '도배' }), []);
  assert.equal(filterFaqs({ categories: [], keyword: null }).length, DISPUTE_FAQS.length);
});

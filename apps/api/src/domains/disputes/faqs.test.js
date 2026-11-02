import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DisputeCategory } from '@prisma/client';
import { DISPUTE_FAQS, filterFaqs } from './faqs.js';
import { toSearchTerms, toTermVariants } from './service.js';

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

test('검색어 나누기: 공백(여러 칸·탭 포함)으로 나누고 같은 단어는 한 번만 쓴다', () => {
  assert.deepEqual(toSearchTerms('보증금  반환\t보증금'), ['보증금', '반환']);
  assert.deepEqual(toSearchTerms('권리금'), ['권리금']);
});

test('비용 끝말: "비용"·"비"로 끝나면 뗀 말로도 찾고, 남는 말이 한 글자면 떼지 않는다', () => {
  assert.deepEqual(toTermVariants('도배비'), ['도배비', '도배']);
  assert.deepEqual(toTermVariants('도배비용'), ['도배비용', '도배']);
  assert.deepEqual(toTermVariants('청소비'), ['청소비', '청소']);
  assert.deepEqual(toTermVariants('준비'), ['준비']);
  assert.deepEqual(toTermVariants('비용'), ['비용']);
  assert.deepEqual(toTermVariants('권리금'), ['권리금']);
});

test('동의어: 같은 뜻 묶음은 양방향, 일상어는 자료의 말로 한 방향, 비용 끝말을 뗀 말의 동의어도 붙는다', () => {
  assert.deepEqual(toTermVariants('월세'), ['월세', '차임', '임대료']);
  assert.deepEqual(toTermVariants('차임'), ['차임', '월세', '임대료']);
  assert.deepEqual(toTermVariants('세입자'), ['세입자', '임차인']);
  assert.deepEqual(toTermVariants('임차인'), ['임차인']);
  assert.deepEqual(toTermVariants('수리비'), ['수리비', '수리', '수선']);
  assert.deepEqual(toTermVariants('원상회복비'), ['원상회복비', '원상회복', '원상복구']);
});

test('바꿔 찾기: "복비"는 그대로 찾지 않고 중개보수·중개수수료로만 찾는다', () => {
  assert.deepEqual(toTermVariants('복비'), ['중개보수', '중개수수료']);
});

test('자주 묻는 질문 거르기: "도배비용"처럼 그대로는 없는 말도 끝말을 뗀 "도배"로 찾는다', () => {
  const found = filterFaqs({ categories: [], keyword: '도배비용' });
  assert.ok(found.length > 0);
  assert.ok(found.every((faq) => `${faq.question}\n${faq.answer}`.includes('도배')));
  assert.ok(found.every((faq) => !`${faq.question}\n${faq.answer}`.includes('도배비용')));
});

test('자주 묻는 질문 거르기: 띄어 쓴 단어는 붙어 있지 않아도 모두 들어 있으면 찾는다(AND)', () => {
  const text = (faq) => `${faq.question}\n${faq.answer}`;
  const both = filterFaqs({ categories: [], keyword: '계약 갱신' });
  assert.ok(both.length > 0);
  assert.ok(both.every((faq) => text(faq).includes('계약') && text(faq).includes('갱신')));
  assert.ok(both.some((faq) => !text(faq).includes('계약 갱신')), '붙어 있지 않은 경우도 찾아야 한다');

  assert.deepEqual(filterFaqs({ categories: [], keyword: '보증금 없는단어123' }), []);
});

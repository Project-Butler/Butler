import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DisputeCategory } from '@prisma/client';
import { SEED_JSON_PATHS } from '../../../prisma/disputeSeedFiles.js';
import { DISPUTE_FAQS, filterFaqs, searchFaqs } from '../../../src/domains/disputes/faqs.js';
import { containsSearchText, toSearchTerms, toTermVariants } from '../../../src/domains/disputes/service.js';

// 근거 자료는 DB에 시드되는 모든 파일(사례집·법령·판례 등, disputeSeedFiles.js)에서 찾는다.
const referenceKeys = new Set(
  SEED_JSON_PATHS.flatMap((jsonPath) => JSON.parse(readFileSync(jsonPath, 'utf8'))).map((reference) => reference.sourceKey),
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

test('불용어: 질문·요청 표현과 뜻이 약한 말은 검색어 단어에서 빼고, 다 빠지면 그대로 찾는다', () => {
  assert.deepEqual(toSearchTerms('보증금 돌려받고 싶어요'), ['보증금', '돌려받고']);
  assert.deepEqual(toSearchTerms('계약 해지 방법 알려주세요'), ['계약', '해지']);
  assert.deepEqual(toSearchTerms('혹시 월세 올려달래요 어떻게 해야하나요'), ['월세', '올려달래요']);
  assert.deepEqual(toSearchTerms('방법'), ['방법']);
  assert.deepEqual(toSearchTerms('어떻게 해요'), ['어떻게', '해요']);
  // "해지"·"하자"처럼 하·해로 시작하는 명사는 빼지 않는다
  assert.deepEqual(toSearchTerms('하자 해지 해제'), ['하자', '해지', '해제']);
});

test('단어 경계: 뜻이 다른 낱말 속 글자(장기수선충당금·수도배관)는 지우고 찾고, "하자"·"이사"는 낱말 첫머리만 인정한다', () => {
  assert.equal(containsSearchText('장기수선충당금을 돌려달라', '수선'), false);
  assert.equal(containsSearchText('장기수선충당금과 수선 의무', '수선'), true);
  assert.equal(containsSearchText('수도배관이 터졌다', '도배'), false);
  assert.equal(containsSearchText('도배와 장판', '도배'), true);
  assert.equal(containsSearchText('수리를 요구하자 거절했다', '하자'), false);
  assert.equal(containsSearchText('주택의 하자 보수', '하자'), true);
  assert.equal(containsSearchText('(하자)담보책임', '하자'), true);
  assert.equal(containsSearchText('하자보수', '하자'), true);
  assert.equal(containsSearchText('대표이사가 서명했다', '이사'), false);
  assert.equal(containsSearchText('이사비와 이사 날짜', '이사'), true);
  // 규칙이 없는 말은 그대로 포함 검색(정상 합성어 임대차보증금)
  assert.equal(containsSearchText('임대차보증금 반환', '보증금'), true);
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

test('조사: 끝에 붙은 조사를 뗀 말로도 찾고(긴 조사 먼저), 남는 말이 한 글자면 떼지 않는다', () => {
  assert.deepEqual(toTermVariants('보증금을'), ['보증금을', '보증금']);
  assert.deepEqual(toTermVariants('임대인에게'), ['임대인에게', '임대인']);
  assert.deepEqual(toTermVariants('계약서에서는'), ['계약서에서는', '계약서']);
  assert.deepEqual(toTermVariants('증거만으로'), ['증거만으로', '증거']);
  assert.deepEqual(toTermVariants('주택으로'), ['주택으로', '주택']);
  assert.deepEqual(toTermVariants('명도'), ['명도']);
  assert.deepEqual(toTermVariants('합의'), ['합의']);
  assert.deepEqual(toTermVariants('보증금'), ['보증금']);
});

test('조사: 조사처럼 끝나는 명사(채권양도·감정평가·건축허가·배당이의·채무초과·곰팡이)는 떼지 않고, 그 뒤 조사만 뗀다', () => {
  for (const noun of ['채권양도', '건물명도', '감정평가', '건축허가', '배당이의', '채무초과', '곰팡이', '스스로']) {
    assert.deepEqual(toTermVariants(noun), [noun]);
  }
  assert.deepEqual(toTermVariants('건물명도를'), ['건물명도를', '건물명도']);
});

test('조사: 뗀 말에 비용 끝말 떼기·동의어가 이어서 붙는다', () => {
  assert.deepEqual(toTermVariants('도배비를'), ['도배비를', '도배비', '도배']);
  assert.deepEqual(toTermVariants('월세를'), ['월세를', '월세', '차임', '임대료']);
  assert.deepEqual(toTermVariants('세입자가'), ['세입자가', '세입자', '임차인']);
});

test('조사: 뗀 말이 바꿔 찾기 대상이면("복비를") 원래 말은 찾지 않는다', () => {
  assert.deepEqual(toTermVariants('복비를'), ['중개보수', '중개수수료']);
});

test('동사: 활용형이 동사 형태로 시작하면 그 형태와 자료에 쓰인 법률 명사로도 찾는다', () => {
  assert.deepEqual(toTermVariants('돌려받고'), ['돌려받고', '돌려받', '반환']);
  assert.deepEqual(toTermVariants('돌려줘요'), ['돌려줘요', '돌려줘', '반환']);
  assert.deepEqual(toTermVariants('밀려서'), ['밀려서', '밀려', '연체', '체납', '미납']);
  assert.deepEqual(toTermVariants('내보내고'), ['내보내고', '내보내', '명도', '퇴거']);
  assert.deepEqual(toTermVariants('올렸어요'), ['올렸어요', '올렸', '증액', '인상']);
});

test('동사: 법률 명사의 동의어도 붙고, 조사는 떼지 않으며(동사 형태로 찾음), 한 글자 형태는 그 글자로는 찾지 않는다', () => {
  assert.deepEqual(toTermVariants('고쳐주세요'), ['고쳐주세요', '고쳐', '수선', '수리']);
  // 퇴거의 동의어(한 방향 퇴거→명도)도 붙는다
  assert.deepEqual(toTermVariants('나가는'), ['나가는', '나가', '퇴거', '명도']);
  assert.deepEqual(toTermVariants('빼고'), ['빼고', '공제', '차감']);
  assert.deepEqual(toTermVariants('원래대로'), ['원래대로', '원상회복', '원상복구']);
  // 동사가 아닌 말은 그대로
  assert.deepEqual(toTermVariants('보증금'), ['보증금']);
  assert.deepEqual(toTermVariants('깨끗하게'), ['깨끗하게']);
});

test('자주 묻는 질문 거르기: "보증금을"처럼 조사를 붙여도 "보증금" 질문을 찾는다', () => {
  const plain = filterFaqs({ categories: [], keyword: '보증금' });
  assert.ok(plain.length > 0);
  assert.deepEqual(filterFaqs({ categories: [], keyword: '보증금을' }), plain);
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

test('띄어쓰기 차이: 네 글자 이상은 공백을 지우고 비교하고, 세 글자 이하는 그대로 비교한다', () => {
  assert.equal(containsSearchText('묵시적 갱신이 되면', '묵시적갱신'), true);
  assert.equal(containsSearchText('묵시적\n갱신', '묵시적갱신'), true);
  assert.equal(containsSearchText('임대 인상', '임대인'), false); // 세 글자: 경계를 넘어 붙이지 않는다
  assert.equal(containsSearchText('보증금 반환', '보증금'), true);
});

test('질문 조건 완화: 모든 단어가 든 질문이 없으면 단어 많은 순 → 드문 단어 순으로, partialMatch로 알린다', () => {
  const text = (faq) => `${faq.question}\n${faq.answer}`;
  // "보증금"은 질문 여러 개, "곰팡이"는 적다 → 둘 다 든 질문이 없으면 곰팡이 질문이 맨 위
  assert.equal(filterFaqs({ categories: [], keyword: '보증금 곰팡이' }).length, 0);
  const { faqs, partialMatch } = searchFaqs({ categories: [], keyword: '보증금 곰팡이' });
  assert.deepEqual(partialMatch, { matchedTermCount: 1, termCount: 2 });
  assert.ok(text(faqs[0]).includes('곰팡이'));
  assert.ok(faqs.every((faq) => text(faq).includes('곰팡이') || text(faq).includes('보증금')));

  // 유형 필터는 완화한 결과에 적용한다
  const damages = searchFaqs({ categories: ['DAMAGES'], keyword: '보증금 곰팡이' });
  assert.ok(damages.faqs.every((faq) => faq.category === 'DAMAGES'));
});

test('질문 조건 완화 안 함: 모두 든 질문이 있거나, 단어가 하나거나, 하나도 안 걸리면 partialMatch는 null', () => {
  const exact = searchFaqs({ categories: [], keyword: '보증금 반환' });
  assert.equal(exact.partialMatch, null);
  assert.deepEqual(exact.faqs, filterFaqs({ categories: [], keyword: '보증금 반환' }));

  // 모두 든 질문이 다른 유형에만 있으면 유형만 바꿔도 완화되지 않는다(0개)
  assert.ok(filterFaqs({ categories: [], keyword: '도배 보증금' }).length > 0);
  const category = Object.values(DisputeCategory).find(
    (value) => filterFaqs({ categories: [value], keyword: '도배 보증금' }).length === 0,
  );
  assert.deepEqual(searchFaqs({ categories: [category], keyword: '도배 보증금' }), {
    faqs: filterFaqs({ categories: [category], keyword: '도배 보증금' }),
    partialMatch: null,
  });

  assert.deepEqual(searchFaqs({ categories: [], keyword: '반려동물' }), { faqs: [], partialMatch: null });
  assert.deepEqual(searchFaqs({ categories: [], keyword: '반려동물 사육금지' }), { faqs: [], partialMatch: null });
});

test('질문 조건 완화: 한 단어만 맞은 질문은 그 단어가 검색어에서 가장 드문 말(핵심어)일 때만 보여 준다', () => {
  const text = (faq) => `${faq.question}\n${faq.answer}`;
  // "보증금 곰팡이": 핵심어 곰팡이가 든 질문만(보증금만 든 질문은 빠짐)
  const mold = searchFaqs({ categories: [], keyword: '보증금 곰팡이' });
  assert.ok(mold.faqs.length > 0);
  assert.ok(mold.faqs.every((faq) => text(faq).includes('곰팡이')));
  // "전세 사기": 사기가 든 질문이 없어서 전세만 맞은 질문은 보여 주지 않는다
  assert.deepEqual(searchFaqs({ categories: [], keyword: '전세 사기' }), { faqs: [], partialMatch: null });
});

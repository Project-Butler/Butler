// 분쟁 참고자료 검색(단어별 AND, 관련도 순)을 실제 로컬 Postgres로 확인한다. RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
// 시드 자료에 없는 지어낸 단어(…테스트어, 칠칠칠)와 sourceKey 접두어 dbtest-dispute-만 쓰고 끝에 지운다.
import { dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prisma } from '../../../src/platform/prismaClient.js';
import { findReferences } from '../../../src/domains/disputes/service.js';

const KEY_PREFIX = 'dbtest-dispute-';
const WORD_A = '가나다테스트어';
const WORD_B = '라마바테스트어';
const WORD_C = '마바사테스트어';
const WORD_D = '아자차테스트어';
const WORD_E = '카타파테스트어';
const WORD_F = '하거너테스트어';
const WORD_G = '거더러테스트어';
const WORD_H = '머버서테스트어';
const WORD_I = '어저처테스트어';
const MISSING_WORD = '없는단어테스트어';
const WORD_J = '처커터테스트어';
const WORD_K = '코토포테스트어';
const RARE_WORD = '퍼허고테스트어';
// 띄어쓰기 확인용: 두 낱말을 붙인 말과 띄어 쓴 말
const SPACE_A = '소오조테스트';
const SPACE_B = '초코토테스트';
// 띄어 쓰기 제안 확인용: 두 낱말이 제목에 떨어져서만(붙어서는 없음) 5건
const SPLIT_A = '푸후구테스트';
const SPLIT_B = '누두루테스트';
const SPLIT_COUNT = 5;
// 점수 보정 확인용: 출현 횟수 / 제목 앞부분 / 근접도
const TF_WORD = '퀘퀴쿼테스트어';
const POSITION_WORD = '퉤튀퉈테스트어';
const NEAR_A = '풰퓌풔테스트어';
const NEAR_B = '훼휘훠테스트어';
// 자료 종류 가산 확인용
const TYPE_WORD = '쮀쮜쭤테스트어';
const COMMON_WORD = '노도로테스트어';
// 흔한 단어 가중치 확인용: COMMON_WORD만 든 자료를 많이 넣어 그 단어를 흔하게 만든다(로컬 DB가 비어 있어도 같은 결과).
const COMMON_FILLER_COUNT = 200;

const reference = (key, fields) => ({
  sourceKey: `${KEY_PREFIX}${key}`,
  type: 'CASE',
  category: 'GENERAL',
  title: '제목',
  summary: '요약',
  content: '본문',
  sourceTitle: 'DB 테스트',
  ...fields,
});

const REFERENCES = [
  // 두 단어가 제목에 붙어서 있음: 단어 점수 + 붙어 있는 검색어 점수
  reference('phrase', { title: `${WORD_A} ${WORD_B} 사례` }),
  // 제목에 A, 요약에 B
  reference('title-summary', { title: `${WORD_A} 사례`, summary: `${WORD_B} 요약` }),
  // 키워드에 A, 본문에 B
  reference('keyword-content', { keywords: [WORD_A], content: `${WORD_B} 본문` }),
  // 본문에만 두 단어가 떨어져서 있음. 판례라 종류 필터 확인에도 쓴다
  reference('content-only', { type: 'PRECEDENT', content: `${WORD_A}을 두고 ${WORD_B}를 다툰 본문` }),
  // A만 있음: AND 검색에서 빠져야 함
  reference('only-a', { title: `${WORD_A}만 있는 사례` }),
  // %가 든 검색어: 제목에 글자 그대로 있음
  reference('percent-title', { title: '칠칠칠% 안내' }),
  // 제목은 '칠칠칠X'(%를 와일드카드로 읽으면 걸림), 요약에 글자 그대로 있음
  reference('percent-summary', { title: '칠칠칠X 안내', summary: '칠칠칠% 요약' }),
  // 붙어 있는 검색어 점수 확인용(단어 C·D): 제목에 붙어서 있음 → 단어 3+3 + 붙음 3 = 9
  reference('cd-phrase', { title: `${WORD_C} ${WORD_D}` }),
  // 제목에 떨어져서 있고 키워드에도 C → 단어 3+3 + 키워드 2 = 8 (붙음 점수가 없으면 이쪽이 앞선다)
  reference('cd-apart', { title: `${WORD_D}와 ${WORD_C}`, keywords: [WORD_C] }),
  // 비용 끝말 확인용(단어 E): 본문에 "E비"가 그대로 있음 / 본문에 끝말 없이 "E"만 / 제목에 "E"만
  reference('cost-exact', { content: `${WORD_E}비 분담` }),
  reference('cost-stem', { content: `${WORD_E} 35만 원` }),
  reference('cost-stem-title', { title: `${WORD_E} 분담` }),
  // 동의어 확인용(단어 F + 실제 낱말): 입력한 '월세'가 제목에 / 같은 뜻 동의어 '차임'만 제목에 / 입력한 '월세'가 요약에
  // / 한 방향 동의어(세입자→임차인)의 '임차인'만 제목에 / 입력한 '세입자'가 요약에
  reference('syn-typed', { title: '월세 제목', content: `${WORD_F} 본문` }),
  reference('syn-only', { title: '차임 제목', content: `${WORD_F} 본문` }),
  reference('syn-typed-summary', { summary: '월세 요약', content: `${WORD_F} 본문` }),
  reference('oneway-only', { title: '임차인 제목', content: `${WORD_F} 본문` }),
  reference('oneway-typed-summary', { summary: '세입자 요약', content: `${WORD_F} 본문` }),
  // 바꿔 찾기 확인용: '복비'는 중개보수로만 찾고 '원상회복비' 속 '복비'로는 찾지 않는다
  reference('broker-fee', { content: `${WORD_F} 중개보수 부담` }),
  reference('recovery-fee', { content: `${WORD_F} 원상회복비 공제` }),
  reference('recovery-fee-particle', { content: `${WORD_F} 원상회복비를 공제` }),
  // 조사 확인용(단어 G): 본문에 "G을"이 그대로 있음 / 제목에 조사 없이 "G"만
  reference('particle-exact', { content: `${WORD_G}을 공제` }),
  reference('particle-stem', { title: `${WORD_G} 안내` }),
  // 조건 완화 확인용(단어 H·I): 두 단어 다 / H만(제목) / I만(본문)
  reference('partial-both', { content: `${WORD_H} 그리고 ${WORD_I}` }),
  reference('partial-h', { title: `${WORD_H} 사례` }),
  reference('partial-i', { type: 'PRECEDENT', content: `${WORD_I} 본문` }),
  // 동사 확인용(단어 J): 자료에는 동사 대신 법률 명사 "반환"만 / 동사 형태 "돌려받"이 그대로 있음 / J만 있음
  reference('verb-noun', { title: `${WORD_J} 보증금 반환` }),
  reference('verb-form', { content: `${WORD_J} 보증금을 돌려받지 못함` }),
  reference('verb-none', { content: `${WORD_J} 다른 이야기` }),
  // 단어 경계 확인용(단어 K): 하자(결함) / "~하자" 동사 끝말 / 수선 / 장기수선충당금 속 수선
  reference('boundary-defect', { content: `${WORD_K} 주택의 하자 보수` }),
  reference('boundary-verb', { content: `${WORD_K} 반환을 요구하자 거절` }),
  reference('boundary-repair', { content: `${WORD_K} 수선 의무` }),
  reference('boundary-fund', { title: `${WORD_K} 장기수선충당금 반환` }),
  // 띄어쓰기 확인용: 본문에 띄어서(줄바꿈 포함) / 제목에 붙여서 / 키워드에 띄어서 / 세 글자 말을 띄어서
  reference('space-apart', { content: `${SPACE_A} 
${SPACE_B} 본문` }),
  reference('space-joined', { title: `${SPACE_A}${SPACE_B} 사례` }),
  reference('space-keyword', { keywords: [`${SPACE_A} ${SPACE_B}`] }),
  reference('space-short', { content: '쿠쿠 쿠쿠 본문' }),
  ...Array.from({ length: SPLIT_COUNT }, (_, index) => reference(`split-${index}`, { title: `${SPLIT_B} 그리고 ${SPLIT_A} ${index}` })),
  // 사건번호·조문 확인용(시드 자료에 없는 2099년 사건·제9999조): 사건번호가 맞는 판례 / 번호가 더 긴 판례 / 본문에 인용만 한 자료(제목에도 있어 점수는 더 높음)
  reference('case-exact', { type: 'PRECEDENT', title: '판례 제목', caseNumber: '대법원 2099. 1. 1. 선고 2099다123456 판결' }),
  reference('case-longer', { type: 'PRECEDENT', caseNumber: '대법원 2099. 1. 2. 선고 2099다1234567 판결' }),
  reference('case-cited', { title: '2099다123456 판결을 따른 사례', content: '2099다123456 판결 인용' }),
  // 조문 원문(법률 둘·시행령) / "제9999조" / 조문을 제목에 인용한 판례(점수는 더 높음)
  reference('law-civil', { type: 'GUIDELINE', title: '민법 제9999조의2(테스트 조문)' }),
  reference('law-housing', { type: 'GUIDELINE', title: '주택임대차보호법 제9999조의2(테스트 조문)' }),
  reference('law-decree', { type: 'GUIDELINE', title: '주택임대차보호법 시행령 제9999조의2(테스트 조문)' }),
  reference('law-plain', { type: 'GUIDELINE', title: '민법 제9999조(테스트 조문)' }),
  reference('law-cited', {
    type: 'PRECEDENT',
    title: '주택임대차보호법 제9999조의2 제1항의 뜻',
    summary: '주택임대차보호법 제9999조의2',
    content: '주택임대차보호법 제9999조의2',
  }),
  // 출현 횟수: 본문에 다섯 번 / 한 번
  reference('tf-many', { content: `${TF_WORD} ${TF_WORD} ${TF_WORD} ${TF_WORD} ${TF_WORD}` }),
  reference('tf-once', { content: `${TF_WORD} 본문` }),
  // 제목 앞부분: 제목 첫머리 / 스무 글자 넘게 뒤 / 띄어쓰기 없는 제목(판례 사건명)의 첫머리
  reference('position-start', { title: `${POSITION_WORD} 관련 사례` }),
  reference('position-late', { title: `앞부분이 아주 길게 이어지는 사례 제목의 맨 끝 ${POSITION_WORD}` }),
  reference('position-case-name', { title: `${POSITION_WORD}반환등` }),
  // 근접도: 본문에 두 단어가 조사를 끼고 가까이 / 멀리(붙은 말 점수는 둘 다 못 받음)
  reference('near', { content: `${NEAR_A}을 ${NEAR_B}했다` }),
  reference('far', { content: `${NEAR_A}을 두고 한참 동안 여러 가지 다른 이야기를 길게 나눈 끝에 ${NEAR_B}했다` }),
  // 자료 종류 가산: 같은 자리(제목)에 있으면 사례가 판례보다 앞 / 제목·요약 둘 다에 있는 판례는 사례보다 앞
  reference('type-precedent', { type: 'PRECEDENT', title: `${TYPE_WORD} 판례` }),
  reference('type-case', { type: 'CASE', title: `${TYPE_WORD} 사례` }),
  reference('type-strong-precedent', { type: 'PRECEDENT', title: `${TYPE_WORD} 판례`, summary: `${TYPE_WORD} 요약` }),
  // 흔한 단어 가중치 확인용: 가중치가 없으면 idf-common-title이 앞섬(제목 3 + 요약 2 = 10 > 제목 3 + 본문 1 = 8, 둘 다 ×2)
  reference('idf-rare-title', { title: `${RARE_WORD} 사례`, content: `${COMMON_WORD} 본문` }),
  reference('idf-common-title', { title: `${COMMON_WORD} 사례`, summary: `${RARE_WORD} 요약` }),
  ...Array.from({ length: COMMON_FILLER_COUNT }, (_, index) =>
    reference(`idf-filler-${index}`, { content: `${COMMON_WORD} 채움 ${index}` }),
  ),
];

const search = async (keyword, { filters = {}, page = 1, size = 20, orderBy = { field: 'relevance', direction: 'desc' } } = {}) => {
  const result = await findReferences({ filters, keyword, page, size, orderBy });
  const rows = await prisma.disputeReference.findMany({
    where: { id: { in: result.items.map((item) => item.id) } },
    select: { id: true, sourceKey: true },
  });
  const sourceKeyById = Object.fromEntries(rows.map((row) => [row.id, row.sourceKey.slice(KEY_PREFIX.length)]));
  return { keys: result.items.map((item) => sourceKeyById[item.id]), meta: result.meta };
};

const removeTestReferences = () => prisma.disputeReference.deleteMany({ where: { sourceKey: { startsWith: KEY_PREFIX } } });

describe('분쟁 참고자료 검색', { skip: dbTestSkip }, () => {
  before(async () => {
    await removeTestReferences();
    await prisma.disputeReference.createMany({ data: REFERENCES });
  });

  after(async () => {
    await removeTestReferences();
    await prisma.$disconnect();
  });

  test('띄어 쓴 단어는 필드가 달라도 모두 있으면 찾고, 하나라도 없으면 뺀다', async () => {
    const { keys, meta } = await search(`${WORD_A}  ${WORD_B}`);
    assert.equal(meta.total, 4);
    assert.deepEqual(new Set(keys), new Set(['phrase', 'title-summary', 'keyword-content', 'content-only']));
  });

  test('관련도 순: 제목에 붙어 있는 자료 > 제목·요약 > 키워드·본문 > 본문만', async () => {
    const { keys } = await search(`${WORD_A} ${WORD_B}`);
    assert.deepEqual(keys, ['phrase', 'title-summary', 'keyword-content', 'content-only']);

    const ascending = await search(`${WORD_A} ${WORD_B}`, { orderBy: { field: 'relevance', direction: 'asc' } });
    assert.deepEqual(ascending.keys, ['content-only', 'keyword-content', 'title-summary', 'phrase']);
  });

  test('관련도 순 페이지: 이어 붙이면 한 번에 받은 순서와 같고, total·hasNext는 전체 기준이다', async () => {
    const whole = await search(`${WORD_A} ${WORD_B}`);
    const first = await search(`${WORD_A} ${WORD_B}`, { size: 3 });
    const second = await search(`${WORD_A} ${WORD_B}`, { size: 3, page: 2 });

    assert.deepEqual([...first.keys, ...second.keys], whole.keys);
    assert.equal(first.meta.total, 4);
    assert.equal(first.meta.hasNext, true);
    assert.equal(second.meta.hasNext, false);
  });

  test('관련도 순에서도 필터와 종류별 개수는 그대로 적용된다', async () => {
    const { keys, meta } = await search(`${WORD_A} ${WORD_B}`, { filters: { type: 'CASE' } });
    assert.deepEqual(keys, ['phrase', 'title-summary', 'keyword-content']);
    assert.equal(meta.countsByType.CASE, 3);
    assert.equal(meta.countsByType.PRECEDENT, 1);
  });

  test('관련도 순: 검색어가 띄어 쓴 그대로 붙어 있으면 점수를 더 받는다', async () => {
    const { keys } = await search(`${WORD_C} ${WORD_D}`);
    assert.deepEqual(keys, ['cd-phrase', 'cd-apart']);
  });

  test('비용 끝말: "E비"·"E비용"은 끝말을 뗀 "E"만 있는 자료도 찾고, 뗀 말도 필드별 점수를 받는다', async () => {
    // 끝말을 뗀 말도 필드별로 점수를 받는다: cost-stem-title은 제목 "E" 3점,
    // cost-exact는 본문 "E비" 1 + 본문 "E" 1 = 2점, cost-stem은 본문 "E" 1점
    const { keys } = await search(`${WORD_E}비`);
    assert.deepEqual(keys, ['cost-stem-title', 'cost-exact', 'cost-stem']);
    // "E비용"은 그대로 있는 자료가 없어 둘 다 끝말을 뗀 "E"로만 걸린다
    const withCost = await search(`${WORD_E}비용`);
    assert.deepEqual(new Set(withCost.keys), new Set(['cost-stem-title', 'cost-exact', 'cost-stem']));
  });

  test('같은 뜻 동의어(1.5배): 같은 필드면 입력한 말이 앞서고, 제목의 동의어는 요약의 입력한 말을 앞선다', async () => {
    // 본문 F 점수는 셋 다 같다. '월세' 단어 가중치를 w라 하면
    // syn-typed 제목 '월세' 3×2w = 6w > syn-only 제목 '차임' 3×1.5w = 4.5w > syn-typed-summary 요약 '월세' 2×2w = 4w
    // (동의어가 1배면 syn-only가 3w로 맨 뒤)
    const { keys } = await search(`${WORD_F} 월세`);
    assert.deepEqual(keys, ['syn-typed', 'syn-only', 'syn-typed-summary']);
  });

  test('한 방향 동의어(1배): 제목의 동의어보다 요약의 입력한 말이 앞선다', async () => {
    // '세입자' 단어 가중치를 w라 하면 oneway-typed-summary 요약 '세입자' 2×2w = 4w > oneway-only 제목 '임차인' 3×1w = 3w
    const { keys } = await search(`${WORD_F} 세입자`);
    assert.deepEqual(keys, ['oneway-typed-summary', 'oneway-only']);
  });

  test('바꿔 찾기: "복비"는 중개보수로 찾고, 원상회복비 속 "복비"로는 찾지 않는다', async () => {
    const { keys } = await search(`${WORD_F} 복비`);
    assert.deepEqual(keys, ['broker-fee']);
  });

  test('조사: "G을"은 조사를 뗀 "G"만 있는 자료도 찾고, 뗀 말도 입력한 말처럼 필드별 점수를 받는다', async () => {
    // particle-stem은 제목 "G" 3×2 = 6점, particle-exact는 본문 "G을" 1×2 + 본문 "G" 1×2 = 4점
    const { keys } = await search(`${WORD_G}을`);
    assert.deepEqual(keys, ['particle-stem', 'particle-exact']);
  });

  test('조사: "복비를"도 중개보수로만 찾고, "원상회복비를" 속 글자로는 찾지 않는다', async () => {
    const { keys } = await search(`${WORD_F} 복비를`);
    assert.deepEqual(keys, ['broker-fee']);
  });

  test('동사: "돌려받고"는 법률 명사 "반환"이 쓰인 자료와 "돌려받"이 그대로 있는 자료를 찾는다', async () => {
    const { keys, meta } = await search(`${WORD_J} 돌려받고`);
    assert.deepEqual(new Set(keys), new Set(['verb-noun', 'verb-form']));
    assert.equal(meta.partialMatch, null);
  });

  test('단어 경계: "하자"는 "요구하자"에, "수선"은 "장기수선충당금"에 걸리지 않는다(검색 조건·개수 모두)', async () => {
    const defect = await search(`${WORD_K} 하자`);
    assert.deepEqual(defect.keys, ['boundary-defect']);
    assert.equal(defect.meta.total, 1);

    const repair = await search(`${WORD_K} 수선`);
    assert.deepEqual(repair.keys, ['boundary-repair']);
    assert.equal(repair.meta.total, 1);
  });

  test('오타 제안: 0건인 단어를 자료에 있는 가장 가까운 낱말로 고쳐 제안하고(조사·다른 단어는 그대로), 맞는 검색어엔 제안이 없다', async () => {
    // WORD_A('가나다테스트어')는 제목 여러 건에 있어 낱말 사전에 들어 있다. 끝 글자 어→아(모음 하나)
    const typo = `${WORD_A.slice(0, -1)}아`;
    const { meta } = await search(`${typo}를 ${WORD_B}`);
    assert.deepEqual(meta.suggestion, {
      query: `${WORD_A}를 ${WORD_B}`,
      corrections: [{ from: `${typo}를`, to: `${WORD_A}를` }],
    });

    assert.equal((await search(`${WORD_A} ${WORD_B}`)).meta.suggestion, null);
  });

  test('한/영 전환 오타: 영문 자판으로 친 말을 자료에 있는 한글로 제안한다', async () => {
    // 'rkskekxptmxmdj'를 두벌식으로 바꾸면 WORD_A('가나다테스트어')
    assert.equal(WORD_A, '가나다테스트어');
    const { meta } = await search(`rkskekxptmxmdj ${WORD_B}`);
    assert.deepEqual(meta.suggestion, {
      query: `${WORD_A} ${WORD_B}`,
      corrections: [{ from: 'rkskekxptmxmdj', to: WORD_A }],
    });

    // 바꿔도 음절이 안 되거나(hug) 자료에 없는 말이면 제안하지 않는다
    assert.equal((await search(`hug ${WORD_B}`)).meta.suggestion, null);
  });

  test('흔한 단어 가중치: 드문 단어가 제목에 있는 자료가 흔한 단어가 제목에 있는 자료보다 앞선다', async () => {
    // RARE_WORD는 2건, COMMON_WORD는 202건에 있다 → 드문 단어 가중치가 훨씬 커서 제목에 드문 단어가 있는 쪽이 앞선다
    const { keys } = await search(`${RARE_WORD} ${COMMON_WORD}`);
    assert.deepEqual(keys, ['idf-rare-title', 'idf-common-title']);
  });

  test('불용어: "싶어요"를 붙여도 완화 없이 같은 자료를 찾는다', async () => {
    const plain = await search(`${WORD_J} 돌려받고`);
    const withStopWord = await search(`${WORD_J} 돌려받고 싶어요`);
    assert.deepEqual(withStopWord.keys, plain.keys);
    assert.equal(withStopWord.meta.partialMatch, null);
  });

  test('조건 완화: 모든 단어가 들어간 자료가 없으면 단어가 하나라도 든 자료를 단어 많은 순 → 관련도 순으로 보여 주고 partialMatch로 알린다', async () => {
    // partial-both: 단어 2개(본문 2+2=4점) / partial-h: 1개(제목 6점) / partial-i: 1개(본문 2점)
    // 단어 수를 먼저 보므로 점수가 낮아도 partial-both가 맨 위
    const { keys, meta } = await search(`${WORD_H} ${WORD_I} ${MISSING_WORD}`);
    assert.deepEqual(keys, ['partial-both', 'partial-h', 'partial-i']);
    assert.equal(meta.total, 3);
    assert.deepEqual(meta.partialMatch, { matchedTermCount: 2, termCount: 3 });

    const ascending = await search(`${WORD_H} ${WORD_I} ${MISSING_WORD}`, { orderBy: { field: 'relevance', direction: 'asc' } });
    assert.deepEqual(ascending.keys, ['partial-i', 'partial-h', 'partial-both']);

    const paged = [
      ...(await search(`${WORD_H} ${WORD_I} ${MISSING_WORD}`, { size: 2 })).keys,
      ...(await search(`${WORD_H} ${WORD_I} ${MISSING_WORD}`, { size: 2, page: 2 })).keys,
    ];
    assert.deepEqual(paged, keys);
  });

  test('조건 완화: 한 단어씩만 맞으면 그 자료들을 관련도 순으로, 종류별 개수도 완화한 결과 기준으로 센다', async () => {
    const { keys, meta } = await search(`${WORD_H}없음 ${WORD_I}`);
    // "H없음"은 없고(붙여도 띄어도 — "H사례"는 이제 띄어쓰기 흡수로 "H 사례"에 걸린다), I만 맞는 자료 2건(partial-both 본문 1점, partial-i 본문 1점) — 동점은 id 순이라 집합으로 본다
    assert.deepEqual(new Set(keys), new Set(['partial-both', 'partial-i']));
    assert.deepEqual(meta.partialMatch, { matchedTermCount: 1, termCount: 2 });
    assert.equal(meta.countsByType.CASE, 1);
    assert.equal(meta.countsByType.PRECEDENT, 1);
  });

  test('조건 완화: 한 글자 단어("안")는 셀 때 빼고, 나머지 단어로 찾는다', async () => {
    const { keys, meta } = await search(`${WORD_H} 안 ${MISSING_WORD}`);
    assert.deepEqual(keys, ['partial-h', 'partial-both']);
    assert.deepEqual(meta.partialMatch, { matchedTermCount: 1, termCount: 3 });
  });

  test('조건 완화 안 함: 모두 맞는 자료가 있거나, 단어가 하나거나, 종류 필터 때문에 0건이면 partialMatch는 null', async () => {
    assert.equal((await search(`${WORD_H} ${WORD_I}`)).meta.partialMatch, null);

    const single = await search(MISSING_WORD);
    assert.equal(single.meta.total, 0);
    assert.equal(single.meta.partialMatch, null);

    const filtered = await search(`${WORD_A} ${WORD_B}`, { filters: { type: 'GUIDELINE' } });
    assert.equal(filtered.meta.total, 0);
    assert.equal(filtered.meta.partialMatch, null);
  });

  test('띄어쓰기 차이: 붙여 찾아도 띄어 쓴 자료(본문·키워드)가 걸리고, 띄어 찾으면 붙여 쓴 자료가 붙은 말 점수를 받는다', async () => {
    const joined = await search(`${SPACE_A}${SPACE_B}`);
    assert.deepEqual([...joined.keys].sort(), ['space-apart', 'space-joined', 'space-keyword']);
    assert.equal(joined.keys[0], 'space-joined'); // 제목에 있음

    // 띄어 찾기: 단어별로는 셋 다(키워드는 낱말이 달라 빠짐) — 붙여 쓴 제목 자료가 단어 점수 + 붙은 말 점수로 맨 위
    const apart = await search(`${SPACE_A} ${SPACE_B}`);
    assert.deepEqual(apart.keys, ['space-joined', 'space-apart']);

    // 세 글자 이하는 띄어쓰기를 무시하지 않는다("쿠쿠 쿠쿠"에 "쿠쿠쿠"는 없음)
    assert.equal((await search('쿠쿠쿠')).meta.total, 0);
  });

  test('띄어 쓰기 제안: 붙여 쓴 말이 없고 두 낱말로 나누면 많이 나오면 띄어 쓴 말을 제안한다', async () => {
    const joined = await search(`${SPLIT_A}${SPLIT_B}을`);
    assert.equal(joined.meta.total, 0);
    assert.deepEqual(joined.meta.suggestion, {
      query: `${SPLIT_A} ${SPLIT_B}을`,
      corrections: [{ from: `${SPLIT_A}${SPLIT_B}을`, to: `${SPLIT_A} ${SPLIT_B}을` }],
    });
    assert.equal((await search(`${SPLIT_A} ${SPLIT_B}`)).meta.total, SPLIT_COUNT);
  });

  test('사건번호: 그 판례가 맨 위, 번호가 더 긴 사건은 안 걸리고, 띄어 쓰거나 법원 이름을 붙여도 찾는다', async () => {
    const { keys } = await search('2099다123456');
    assert.deepEqual(keys, ['case-exact', 'case-cited']);
    assert.deepEqual((await search('대법원 2099다 123456')).keys, ['case-exact']); // 인용 자료에는 "대법원"이 없음
    assert.equal((await search('2099다12345')).meta.total, 0);
  });

  test('조문: 조문 원문이 맨 위(법률 → 시행령), 법 이름(약칭)을 쓰면 그 법만, "제9999조"는 "제9999조의2"에 안 걸린다', async () => {
    const { keys } = await search('제9999조의2');
    assert.deepEqual(new Set(keys.slice(0, 2)), new Set(['law-civil', 'law-housing']));
    assert.deepEqual(keys.slice(2), ['law-decree', 'law-cited']);

    assert.equal((await search('주택임대차보호법 9999조의2')).keys[0], 'law-housing');
    assert.equal((await search('주임법 제9999조의2')).keys[0], 'law-housing');
    assert.equal((await search('민법 9999조')).keys[0], 'law-plain');
    assert.deepEqual((await search('제9999조')).keys, ['law-plain']);
  });

  test('출현 횟수: 본문에 여러 번 나온 자료가 한 번 나온 자료보다 앞선다', async () => {
    assert.deepEqual((await search(TF_WORD)).keys, ['tf-many', 'tf-once']);
  });

  test('제목 앞부분: 제목이 그 말로 시작하는 자료가 앞, 띄어쓰기 없는 제목(사건명)은 가산하지 않는다', async () => {
    const { keys } = await search(POSITION_WORD);
    assert.equal(keys[0], 'position-start');
    assert.deepEqual(new Set(keys.slice(1)), new Set(['position-late', 'position-case-name']));
  });

  test('근접도: 두 단어가 가까이 있는 자료가 멀리 떨어진 자료보다 앞선다', async () => {
    assert.deepEqual((await search(`${NEAR_A} ${NEAR_B}`)).keys, ['near', 'far']);
  });

  test('자료 종류 가산: 점수가 같으면 사례가 판례보다 앞, 관련도가 크게 높은 판례는 그대로 앞', async () => {
    assert.deepEqual((await search(TYPE_WORD)).keys, ['type-strong-precedent', 'type-case', 'type-precedent']);
  });

  test('관련도 점수에서 %는 와일드카드가 아니라 글자 그대로 찾는다', async () => {
    // %를 와일드카드로 읽으면 percent-summary의 제목 '칠칠칠X'도 맞아 제목+요약 점수로 앞서게 된다.
    const { keys } = await search('칠칠칠%');
    assert.deepEqual(keys, ['percent-title', 'percent-summary']);
  });

});

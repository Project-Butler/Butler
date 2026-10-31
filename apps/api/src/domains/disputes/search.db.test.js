// 분쟁 참고자료 검색(단어별 AND, 관련도 순)을 실제 로컬 Postgres로 확인한다. RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
// 시드 자료에 없는 지어낸 단어(…테스트어, 칠칠칠)와 sourceKey 접두어 dbtest-dispute-만 쓰고 끝에 지운다.
import { dbTestSkip } from '../../testSupport/dbTest.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prisma } from '../../platform/prismaClient.js';
import { findReferences } from './service.js';

const KEY_PREFIX = 'dbtest-dispute-';
const WORD_A = '가나다테스트어';
const WORD_B = '라마바테스트어';
const WORD_C = '마바사테스트어';
const WORD_D = '아자차테스트어';
const WORD_E = '카타파테스트어';
const WORD_F = '하거너테스트어';

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
  // 동의어 확인용(단어 F + 실제 낱말): 입력한 '월세'가 요약에 / 동의어 '차임'만 제목에
  reference('syn-typed', { summary: '월세 요약', content: `${WORD_F} 본문` }),
  reference('syn-only', { title: '차임 제목', content: `${WORD_F} 본문` }),
  // 바꿔 찾기 확인용: '복비'는 중개보수로만 찾고 '원상회복비' 속 '복비'로는 찾지 않는다
  reference('broker-fee', { content: `${WORD_F} 중개보수 부담` }),
  reference('recovery-fee', { content: `${WORD_F} 원상회복비 공제` }),
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

  test('동의어: 동의어로만 맞은 자료도 찾되, 입력한 말은 2배·동의어는 1배라 입력한 말이 있는 자료가 앞선다', async () => {
    // syn-typed: 요약 '월세' 2×2 + 본문 F 1×2 = 6, syn-only: 제목 '차임' 3×1 + 본문 F 1×2 = 5
    // (배율이 없으면 syn-only가 3 + 1 = 4로 syn-typed 2 + 1 = 3을 앞선다)
    const { keys } = await search(`${WORD_F} 월세`);
    assert.deepEqual(keys, ['syn-typed', 'syn-only']);
  });

  test('바꿔 찾기: "복비"는 중개보수로 찾고, 원상회복비 속 "복비"로는 찾지 않는다', async () => {
    const { keys } = await search(`${WORD_F} 복비`);
    assert.deepEqual(keys, ['broker-fee']);
  });

  test('관련도 점수에서 %는 와일드카드가 아니라 글자 그대로 찾는다', async () => {
    // %를 와일드카드로 읽으면 percent-summary의 제목 '칠칠칠X'도 맞아 제목+요약 점수로 앞서게 된다.
    const { keys } = await search('칠칠칠%');
    assert.deepEqual(keys, ['percent-title', 'percent-summary']);
  });

});

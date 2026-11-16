import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findLegalReferences,
  isArticleText,
  isCaseNumberText,
  normalizeLegalReferences,
  toLawTitlePatterns,
  toLegalReferencePattern,
} from '../../../src/domains/disputes/legalReferences.js';

test('검색어 정리: 사건번호·조문을 한 가지 모양으로 붙여 쓴다', () => {
  assert.equal(normalizeLegalReferences('2020다 226452'), '2020다226452');
  assert.equal(normalizeLegalReferences('대법원 85다카 794 판결'), '대법원 85다카794 판결');
  assert.equal(normalizeLegalReferences('제 6 조의 3'), '제6조의3');
  assert.equal(normalizeLegalReferences('6조의3 갱신'), '제6조의3 갱신');
  assert.equal(normalizeLegalReferences('민법 640조'), '민법 제640조'); // 법 이름 뒤 "N조"
  assert.equal(normalizeLegalReferences('제6조의 규정'), '제6조의 규정'); // 조사 '의'는 그대로
  // 사건번호·조문이 아닌 말은 그대로
  assert.equal(normalizeLegalReferences('2023년 5월 보증금'), '2023년 5월 보증금');
  assert.equal(normalizeLegalReferences('6조 원'), '6조 원');
  assert.equal(normalizeLegalReferences('보증금 6조'), '보증금 6조'); // 법 이름이 없으면 "N조"는 안 바꿈
});

test('사건번호·조문 알아보기', () => {
  assert.ok(isCaseNumberText('2020다226452'));
  assert.ok(isCaseNumberText('85다카794'));
  assert.ok(isCaseNumberText('2005가합100279'));
  assert.ok(!isCaseNumberText('2023년5'));
  assert.ok(!isCaseNumberText('보증금'));
  assert.ok(isArticleText('제6조'));
  assert.ok(isArticleText('제6조의3'));
  assert.ok(!isArticleText('제6조의3을'));
  assert.ok(!isArticleText('6조'));
});

test('경계 지켜 찾기: 사건번호 앞뒤 숫자, "제6조"와 "제6조의3"을 구분한다', () => {
  const matches = (text, value) => new RegExp(toLegalReferencePattern(text)).test(value);
  assert.ok(matches('2020다226452', '대법원 2022. 5. 26. 선고 2020다226452 판결'));
  assert.ok(!matches('2020다22645', '대법원 2022. 5. 26. 선고 2020다226452 판결'));
  assert.ok(!matches('20다226452', '선고 2020다226452 판결')); // 앞에 숫자
  assert.ok(matches('제6조', '주택임대차보호법 제6조(계약의 갱신)'));
  assert.ok(matches('제6조', '제6조의 규정에 따라'));
  assert.ok(!matches('제6조', '제6조의3 제1항'));
  assert.ok(matches('제6조의3', '제6조의3 제1항'));
  assert.ok(!matches('제6조의3', '제6조의30'));
  assert.equal(toLegalReferencePattern('보증금'), null);
});

test('맨 위에 둘 자료: 사건번호, 조문 + 법 이름(약칭 포함, 하나일 때만)', () => {
  assert.deepEqual(findLegalReferences('대법원 2020다 226452'), { caseNumbers: ['2020다226452'], articles: [] });
  assert.deepEqual(findLegalReferences('주임법 6조의3'), {
    caseNumbers: [],
    articles: [{ law: '주택임대차보호법', article: '제6조의3' }],
  });
  assert.deepEqual(findLegalReferences('상가건물 임대차보호법 시행령 제4조').articles, [
    { law: '상가건물임대차보호법시행령', article: '제4조' },
  ]);
  assert.deepEqual(findLegalReferences('제6조').articles, [{ law: null, article: '제6조' }]);
  assert.deepEqual(findLegalReferences('민법 주택임대차보호법 제6조').articles, [{ law: null, article: '제6조' }]); // 법 둘
  assert.deepEqual(findLegalReferences('보증금 반환'), { caseNumbers: [], articles: [] });
});

test('조문 원문 제목: 법 이름이 있으면 그 법만, 없으면 법률이 먼저·시행령이 다음', () => {
  const matches = (pattern, title) => new RegExp(pattern).test(title.replaceAll(' ', ''));
  const named = toLawTitlePatterns({ law: '주택임대차보호법', article: '제6조' });
  assert.ok(matches(named.primary, '주택임대차보호법 제6조(계약의 갱신)'));
  assert.ok(!matches(named.primary, '주택임대차보호법 시행령 제6조(요청할 수 있는 정보)'));
  assert.equal(named.secondary, null);

  const unnamed = toLawTitlePatterns({ law: null, article: '제6조' });
  assert.ok(matches(unnamed.primary, '상가건물 임대차보호법 제6조(임차권등기명령)'));
  assert.ok(!matches(unnamed.primary, '주택임대차보호법 시행령 제6조(요청할 수 있는 정보)'));
  assert.ok(matches(unnamed.secondary, '주택임대차보호법 시행령 제6조(요청할 수 있는 정보)'));
  assert.ok(!matches(unnamed.primary, '임차인이 주택임대차보호법 제6조(계약의 갱신)에 따라')); // 판례 제목
  assert.ok(!matches(unnamed.primary, '민법 제6조의3(테스트)'));
});

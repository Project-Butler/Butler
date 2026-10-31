import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toSourceUrl } from './sourceLinks.js';

test('원문 링크: 국가법령정보센터 판례는 판례 일련번호로 그 판례를 연다', () => {
  assert.equal(
    toSourceUrl({ sourceKey: 'lawgo-prec-205612', title: '권리금', caseNumber: '대구고등법원 2018. 8. 24. 선고 2017나21191 판결' }),
    'https://www.law.go.kr/LSW/precInfoP.do?precSeq=205612',
  );
});

test('원문 링크: 법령은 그 조문(제N조의M)을 연다, 시행령은 시행령으로', () => {
  assert.equal(
    decodeURI(toSourceUrl({ sourceKey: 'law-hlpa-3-2', title: '주택임대차보호법 제3조의2(보증금의 회수)' })),
    'https://www.law.go.kr/법령/주택임대차보호법/제3조의2',
  );
  assert.equal(
    decodeURI(toSourceUrl({ sourceKey: 'law-clpa-dec-7', title: '상가건물 임대차보호법 시행령 제7조(우선변제를 받을 보증금)' })),
    'https://www.law.go.kr/법령/상가건물임대차보호법시행령/제7조',
  );
});

test('원문 링크: 사례집 속 판례는 국가법령정보센터에 있으면 그 판례, 없으면 사례집 링크', () => {
  assert.equal(
    toSourceUrl({ sourceKey: 'casebook-2025-P-94da34692', title: '수선의무', caseNumber: '대법원 1994. 12. 9. 선고 94다34692, 94다34708 판결' }),
    'https://www.law.go.kr/LSW/precInfoP.do?precSeq=199673',
  );
  assert.equal(
    toSourceUrl({ sourceKey: 'casebook-2025-P-2022gadan6858', title: '갱신요구', caseNumber: '서울중앙지방법원 2023. 1. 26. 선고 2022가단6858 판결' }),
    'https://adrhome.reb.or.kr',
  );
});

test('원문 링크: 사례집·가이드북은 책을 받을 수 있는 게시글, 모르는 자료는 null', () => {
  assert.equal(toSourceUrl({ sourceKey: 'klac-2023-H-01', title: '사례' }), 'https://www.hldcc.or.kr/hp/li/arrCaseList.do');
  assert.equal(toSourceUrl({ sourceKey: 'molit-2022-H-s1-2', title: '사례' }), 'https://www.molit.go.kr/USR/policyData/m_34681/dtl.jsp?id=4675');
  assert.equal(toSourceUrl({ sourceKey: 'unknown-1', title: '자료' }), null);
});

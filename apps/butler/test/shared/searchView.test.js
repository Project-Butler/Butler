import { describe, expect, it } from 'vitest';
import {
  countResults,
  describeDocument,
  describeProperty,
  formatShortDate,
  getScheduleDday,
  isSearchableQuery,
  normalizeQuery,
  splitHighlight,
} from '../../src/shared/search/searchView';

describe('통합 검색 표기', () => {
  it('검색어 정리와 길이 검사', () => {
    expect(normalizeQuery('  101호   보일러 ')).toBe('101호 보일러');
    expect(isSearchableQuery(' 가 ')).toBe(false);
    expect(isSearchableQuery('보일')).toBe(true);
    expect(isSearchableQuery('가'.repeat(51))).toBe(false);
  });

  it('검색어 단어를 강조 조각으로 나눈다(대소문자 무시)', () => {
    expect(splitHighlight('101호 보일러 수리 완료', '101호 보일러')).toEqual([
      { text: '101호', match: true },
      { text: ' ', match: false },
      { text: '보일러', match: true },
      { text: ' 수리 완료', match: false },
    ]);
    expect(splitHighlight('Receipt.JPG', 'jpg')).toEqual([
      { text: 'Receipt.', match: false },
      { text: 'JPG', match: true },
    ]);
    expect(splitHighlight('a+b', 'a+')).toEqual([
      { text: 'a+', match: true },
      { text: 'b', match: false },
    ]);
  });

  it('호실·문서 설명', () => {
    expect(describeProperty({ currentContract: { status: 'ACTIVE', deposit: 50000000 } })).toBe('계약 중 · 보증금 5,000만');
    expect(describeProperty({ currentContract: null })).toBe('계약 없음');
    expect(describeDocument({ type: 'RECEIPT', createdAt: '2026-10-19T16:00:00.000Z' })).toBe('영수증 · 2026-10-20');
  });

  it('날짜·D-day·결과 수', () => {
    expect(formatShortDate('2026-10-20')).toBe('10-20');
    expect(getScheduleDday({ date: '2026-10-23' }, '2026-10-20')).toBe('D-3');
    expect(getScheduleDday({ date: '2026-10-19' }, '2026-10-20')).toBeNull();
    expect(countResults({ properties: [1], managementLogs: [1, 2], documents: [] })).toBe(3);
    expect(countResults(null)).toBe(0);
  });
});

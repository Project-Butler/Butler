import { describe, expect, it } from 'vitest';
import { canDeleteLog, formatLogDate, getLogOriginLabel, getLogScopeBadge, getLogTypeLabel, isFutureLog } from '../src/utils/managementLog';

describe('getLogOriginLabel', () => {
  it('내가 쓴 기록은 표시하지 않는다', () => {
    expect(getLogOriginLabel({ author: { id: 'me' }, source: { resourceType: null } })).toBeNull();
  });
  it('작성자가 없고 만든 곳이 있으면 자동 기록', () => {
    expect(getLogOriginLabel({ author: null, source: { resourceType: 'TICKET' } })).toBe('자동 기록');
  });
  it('작성자가 없고 만든 곳도 없으면 이전 소유자', () => {
    expect(getLogOriginLabel({ author: null, source: { resourceType: null } })).toBe('이전 소유자');
  });
});

describe('canDeleteLog', () => {
  it('내가 쓴 나만 보기만 지울 수 있다', () => {
    expect(canDeleteLog({ author: { id: 'me' }, scope: 'PRIVATE' })).toBe(true);
    expect(canDeleteLog({ author: { id: 'me' }, scope: 'PROPERTY_HISTORY' })).toBe(false);
    expect(canDeleteLog({ author: null, scope: 'PRIVATE' })).toBe(false);
  });
});

describe('표시 값', () => {
  it('미래 날짜만 예정이다', () => {
    expect(isFutureLog({ occurredOn: '2026-11-03' }, '2026-11-02')).toBe(true);
    expect(isFutureLog({ occurredOn: '2026-11-02' }, '2026-11-02')).toBe(false);
  });
  it('라벨과 날짜', () => {
    expect(getLogTypeLabel('TICKET_SUMMARY')).toBe('수리 요청 완료');
    expect(getLogScopeBadge('PROPERTY_HISTORY').label).toBe('호실 이력');
    expect(formatLogDate('2026-10-12')).toBe('10.12');
  });
});

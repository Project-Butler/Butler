import { describe, expect, it } from 'vitest';
import { collectingNotice } from '../../src/landlord/web/utils/communityMarketCollecting';

const progress = (values) => ({
  requiredMonths: 13, collectedMonths: 0, failedMonths: 0, notTriedMonths: 13, lastAttemptedAt: null, lastFailedAt: null, lastErrorCode: null, ...values,
});
const FIRST = { kind: 'FIRST', title: '이 단지의 실거래를 모으는 중이에요', progressParts: null, description: '하루 안에 채워집니다. 그때 다시 열어 주세요.', lastAttemptDate: null };
const text = (notice) => [notice.progressParts?.join(''), notice.description].filter(Boolean).join(' · ');

describe('시세 모으는 중 안내(collectingNotice) — 일부 모음 · 하나도 못 모음 + 실패 · 시도 전 (#267)', () => {
  it('아직 시도 전(모은 달 · 실패한 달 모두 0)이면 11/17 문구 그대로 — 이전 서버(collectionProgress 없음)도', () => {
    expect(collectingNotice({ collectionProgress: progress() })).toEqual(FIRST);
    expect(collectingNotice({ collectionStatus: 'COLLECTING' })).toEqual(FIRST);
  });

  it('실패 없이 일부만 모았으면(처음 모으는 중) "시세를 모으는 중이에요" + 최근 13개월 중 n개월 · 매일 새벽 이어서', () => {
    const notice = collectingNotice({ collectionProgress: progress({ collectedMonths: 3, notTriedMonths: 10, lastAttemptedAt: '2026-11-24T17:00:03.000Z' }) });
    expect(notice).toEqual({
      kind: 'PARTIAL',
      title: '시세를 모으는 중이에요',
      progressParts: ['최근 ', 13, '개월 중 ', 3, '개월을 모았어요'],
      description: '매일 새벽 이어서 모아요',
      lastAttemptDate: null,
    });
    expect(text(notice)).toBe('최근 13개월 중 3개월을 모았어요 · 매일 새벽 이어서 모아요');
  });

  it('일부 모았으면 실패한 달이 있어도 실패 안내가 아니다(11/27 배포 노원구 8 · 5 · 0, 옛 실패 코드 30) — 실패 코드 · 날짜 없음', () => {
    const notice = collectingNotice({
      collectionProgress: progress({
        collectedMonths: 8, failedMonths: 5, notTriedMonths: 0,
        lastAttemptedAt: '2026-11-26T17:32:00.000Z', lastFailedAt: '2026-11-24T17:32:00.000Z', lastErrorCode: '30',
      }),
    });
    expect(notice.kind).toBe('PARTIAL');
    expect(notice.title).toBe('시세를 모으는 중이에요');
    expect(text(notice)).toBe('최근 13개월 중 8개월을 모았어요 · 매일 새벽 이어서 모아요');
    expect(notice.lastAttemptDate).toBeNull();
    expect(JSON.stringify(notice)).not.toMatch(/30|불러오지 못했어요|2026/);
  });

  it('13 은 응답의 requiredMonths 그대로(박아 넣지 않는다)', () => {
    const notice = collectingNotice({ collectionProgress: progress({ requiredMonths: 12, collectedMonths: 7, notTriedMonths: 5 }) });
    expect(text(notice)).toBe('최근 12개월 중 7개월을 모았어요 · 매일 새벽 이어서 모아요');
  });

  it('하나도 못 모았는데 실패한 달이 있으면 "아직 불러오지 못했어요" + 매일 새벽 다시 시도 + 마지막 시도 한국 날짜', () => {
    // UTC 11/24 17:00 = 한국 11/25 02:00(정기 실행 시각)
    const notice = collectingNotice({ collectionProgress: progress({ failedMonths: 13, notTriedMonths: 0, lastAttemptedAt: '2026-11-24T17:00:05.000Z', lastErrorCode: 'NO_KEY' }) });
    expect(notice).toEqual({ kind: 'FAILED', title: '시세를 아직 불러오지 못했어요', progressParts: null, description: '매일 새벽 다시 시도하고 있어요', lastAttemptDate: '2026-11-25' });
  });

  it('실패 안내에도 실패 코드는 넣지 않는다 · 시도 시각이 없으면 날짜 없이', () => {
    const notice = collectingNotice({ collectionProgress: progress({ failedMonths: 13, notTriedMonths: 0, lastErrorCode: '30' }) });
    expect(notice.kind).toBe('FAILED');
    expect(notice.lastAttemptDate).toBeNull();
    expect(JSON.stringify(notice)).not.toContain('30');
  });
});

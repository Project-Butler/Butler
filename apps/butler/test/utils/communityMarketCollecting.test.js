import { describe, expect, it } from 'vitest';
import { collectingNotice } from '../../src/landlord/web/utils/communityMarketCollecting';

const progress = (values) => ({ requiredMonths: 13, collectedMonths: 0, failedMonths: 0, notTriedMonths: 13, lastAttemptedAt: null, lastErrorCode: null, ...values });

describe('시세 모으는 중 안내(collectingNotice)', () => {
  it('실패한 달이 없으면(처음 모으는 중) 11/17 문구 그대로', () => {
    const first = { failed: false, title: '이 단지의 실거래를 모으는 중이에요', description: '하루 안에 채워집니다. 그때 다시 열어 주세요.', lastAttemptDate: null };
    expect(collectingNotice({ collectionProgress: progress() })).toEqual(first);
    expect(collectingNotice({ collectionProgress: progress({ collectedMonths: 3, notTriedMonths: 10, lastAttemptedAt: '2026-11-24T17:00:03.000Z' }) })).toEqual(first);
    // 이전 서버(collectionProgress 없음)도 처음 모으는 중으로
    expect(collectingNotice({ collectionStatus: 'COLLECTING' })).toEqual(first);
  });

  it('실패한 달이 있으면 "아직 불러오지 못했어요" + 매일 새벽 다시 시도 + 마지막 시도 한국 날짜', () => {
    // UTC 11/24 17:00 = 한국 11/25 02:00(정기 실행 시각)
    const notice = collectingNotice({ collectionProgress: progress({ failedMonths: 13, notTriedMonths: 0, lastAttemptedAt: '2026-11-24T17:00:05.000Z', lastErrorCode: 'NO_KEY' }) });
    expect(notice).toEqual({ failed: true, title: '시세를 아직 불러오지 못했어요', description: '매일 새벽 다시 시도하고 있어요', lastAttemptDate: '2026-11-25' });
  });

  it('실패 코드는 문구에 넣지 않는다 · 시도 시각이 없으면 날짜 없이', () => {
    const notice = collectingNotice({ collectionProgress: progress({ collectedMonths: 12, failedMonths: 1, notTriedMonths: 0, lastErrorCode: '30' }) });
    expect(notice.failed).toBe(true);
    expect(notice.lastAttemptDate).toBeNull();
    expect(JSON.stringify(notice)).not.toContain('30');
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { retentionMonths } from '../../../../src/domains/marketPrices/months.js';
import { parseMarketQuery, summarizeCollectionProgress, toMonthly, withKeyShape } from '../../../../src/domains/marketPrices/service/prices.js';

const NOW = new Date('2026-11-17T03:00:00Z');
const row = (yearMonth, values) => ({ contractYearMonth: yearMonth, price: null, deposit: null, monthlyRent: null, ...values });

describe('시세 조회 조건', () => {
  test('dealType 필수, 기본 기간은 이번 달까지 13개월(완성된 달 12개 + 이번 달), 면적은 숫자', () => {
    assert.deepEqual(parseMarketQuery({ dealType: 'SALE' }, NOW), { dealType: 'SALE', areaMin: null, areaMax: null, from: '2025-11', to: '2026-11' });
    assert.deepEqual(parseMarketQuery({ dealType: 'MONTHLY', areaMin: '60', areaMax: '85', toYearMonth: '2026-06' }, NOW), {
      dealType: 'MONTHLY',
      areaMin: 60,
      areaMax: 85,
      from: '2025-06',
      to: '2026-06',
    });
  });

  test('잘못된 입력은 400 MARKET_PRICE_INVALID_QUERY(어느 칸인지 details 에)', () => {
    const cases = [
      [{}, 'dealType'],
      [{ dealType: 'RENT' }, 'dealType'],
      [{ dealType: 'SALE', areaMin: 'abc' }, 'areaMin'],
      [{ dealType: 'SALE', areaMin: '-1' }, 'areaMin'],
      [{ dealType: 'SALE', areaMin: '90', areaMax: '80' }, 'areaMin'],
      [{ dealType: 'SALE', fromYearMonth: '2026-13' }, 'fromYearMonth'],
      [{ dealType: 'SALE', fromYearMonth: '2026-10', toYearMonth: '2026-09' }, 'fromYearMonth'],
    ];
    for (const [query, field] of cases) {
      assert.throws(() => parseMarketQuery(query, NOW), (error) => {
        assert.equal(error.code, 'MARKET_PRICE_INVALID_QUERY');
        assert.equal(error.httpStatus, 400);
        assert.equal(error.details[0].field, field);
        return true;
      });
    }
  });
});

describe('달별 집계', () => {
  test('매매: 평균(반올림) · 최저 · 최고, 거래 있는 달만 오름차순', () => {
    const monthly = toMonthly(
      [row('2026-10', { price: 100n }), row('2026-08', { price: 300n }), row('2026-10', { price: 201n })],
      'SALE',
    );
    assert.deepEqual(monthly, [
      { yearMonth: '2026-08', dealCount: 1, avgPrice: 300, minPrice: 300, maxPrice: 300, avgDeposit: null, avgMonthlyRent: null },
      { yearMonth: '2026-10', dealCount: 2, avgPrice: 151, minPrice: 100, maxPrice: 201, avgDeposit: null, avgMonthlyRent: null },
    ]);
  });

  test('전세는 avgDeposit, 월세는 avgDeposit · avgMonthlyRent(나머지 null)', () => {
    assert.deepEqual(toMonthly([row('2026-10', { deposit: 500000000n })], 'JEONSE'), [
      { yearMonth: '2026-10', dealCount: 1, avgPrice: null, minPrice: null, maxPrice: null, avgDeposit: 500000000, avgMonthlyRent: null },
    ]);
    assert.deepEqual(toMonthly([row('2026-10', { deposit: 100000000n, monthlyRent: 2000000n }), row('2026-10', { deposit: 200000000n, monthlyRent: 3000000n })], 'MONTHLY'), [
      { yearMonth: '2026-10', dealCount: 2, avgPrice: null, minPrice: null, maxPrice: null, avgDeposit: 150000000, avgMonthlyRent: 2500000 },
    ]);
    assert.deepEqual(toMonthly([], 'SALE'), []);
  });
});

describe('모으기 진행(COLLECTING 의 collectionProgress) — 보관 13개월 기준, 달마다 모음 · 실패 · 안 해 봄 중 하나', () => {
  const MONTHS = retentionMonths(NOW); // 2025-11 ~ 2026-11
  const at = (iso) => new Date(iso);
  const ok = (yearMonth, iso) => ({ yearMonth, collectedAt: at(iso), attemptedAt: at(iso), lastErrorCode: null });
  const fail = (yearMonth, iso, code) => ({ yearMonth, collectedAt: null, attemptedAt: at(iso), lastErrorCode: code });

  test('한 번도 안 시도함: 모두 안 해 봄, 시도 시각 · 코드 없음', () => {
    assert.deepEqual(summarizeCollectionProgress([], MONTHS), {
      requiredMonths: 13, collectedMonths: 0, failedMonths: 0, notTriedMonths: 13, lastAttemptedAt: null, lastErrorCode: null,
    });
  });

  test('모두 성공 전(처음 모으는 중): 모은 달 + 아직 차례 안 온 달, 실패 없음 → 코드 null', () => {
    const rows = [ok('2026-11', '2026-11-16T17:00:01Z'), ok('2026-10', '2026-11-16T17:00:02Z'), ok('2026-09', '2026-11-16T17:00:03Z')];
    assert.deepEqual(summarizeCollectionProgress(rows, MONTHS), {
      requiredMonths: 13, collectedMonths: 3, failedMonths: 0, notTriedMonths: 10, lastAttemptedAt: '2026-11-16T17:00:03.000Z', lastErrorCode: null,
    });
  });

  test('일부 FAILED(코드 30): 실패만 한 달 수와 가장 최근 실패의 코드, 마지막 시도는 성공 · 실패 중 가장 늦은 것', () => {
    const rows = [
      ...MONTHS.slice(2).map((month) => ok(month, '2026-11-15T17:00:00Z')),
      fail(MONTHS[0], '2026-11-16T17:00:09Z', '30'),
      fail(MONTHS[1], '2026-11-15T17:00:09Z', 'TIMEOUT'), // 더 오래된 실패 — 코드는 최근 것(30)
    ];
    assert.deepEqual(summarizeCollectionProgress(rows, MONTHS), {
      requiredMonths: 13, collectedMonths: 11, failedMonths: 2, notTriedMonths: 0, lastAttemptedAt: '2026-11-16T17:00:09.000Z', lastErrorCode: '30',
    });
  });

  test('NO_KEY(키 없음 — 받기 전에 실패): 모든 달이 실패만', () => {
    const rows = MONTHS.map((month, index) => fail(month, `2026-11-24T17:00:${String(index).padStart(2, '0')}Z`, 'NO_KEY'));
    assert.deepEqual(summarizeCollectionProgress(rows, MONTHS), {
      requiredMonths: 13, collectedMonths: 0, failedMonths: 13, notTriedMonths: 0, lastAttemptedAt: '2026-11-24T17:00:12.000Z', lastErrorCode: 'NO_KEY',
    });
  });

  test('모은 뒤 다시 모으기가 실패한 달은 "모음"(데이터가 있다) · 보관 기간 밖의 행은 세지 않는다 · 이상한 코드는 UNKNOWN', () => {
    const refreshFailed = { ...ok('2026-11', '2026-11-10T17:00:00Z'), attemptedAt: at('2026-11-16T17:00:00Z'), lastErrorCode: 'TIMEOUT' };
    const old = fail('2025-10', '2026-11-16T18:00:00Z', '30'); // 보관 기간(2025-11 ~) 밖
    const odd = fail('2026-10', '2026-11-16T17:30:00Z', 'https://example.test/?serviceKey=abc');
    assert.deepEqual(summarizeCollectionProgress([refreshFailed, old, odd], MONTHS), {
      requiredMonths: 13, collectedMonths: 1, failedMonths: 1, notTriedMonths: 11, lastAttemptedAt: '2026-11-16T17:30:00.000Z', lastErrorCode: 'UNKNOWN',
    });
  });
});

describe('키 모양(collectionProgress.keyShape) — 키 오류(30 · NO_KEY)일 때만, 길이 · 참/거짓만 (#233)', () => {
  // 가짜 16진수 키 — 실제 키가 아니다
  const HEX = '0123456789abcdef'.repeat(4);
  const base = { requiredMonths: 13, collectedMonths: 0, failedMonths: 13, notTriedMonths: 0, lastAttemptedAt: '2026-11-24T17:32:00.000Z' };

  test('30: 그 순간의 키 값으로 계산 — 따옴표 + 줄바꿈이 붙은 16진수 키', () => {
    assert.deepEqual(withKeyShape({ ...base, lastErrorCode: '30' }, `"${HEX}"\n`), {
      ...base,
      lastErrorCode: '30',
      keyShape: { rawLength: 67, cleanedLength: 64, hadWhitespace: true, hadQuotes: true, hadPercent: false, cleanedIsHex: true },
    });
  });

  test('NO_KEY: 키가 비었으면 길이 0 · 모두 false', () => {
    assert.deepEqual(withKeyShape({ ...base, lastErrorCode: 'NO_KEY' }, '').keyShape, {
      rawLength: 0, cleanedLength: 0, hadWhitespace: false, hadQuotes: false, hadPercent: false, cleanedIsHex: false,
    });
  });

  test('다른 실패 코드(TIMEOUT · 23 · UNKNOWN) · 실패 없음(null)은 그대로 — keyShape 칸이 없다', () => {
    for (const code of ['TIMEOUT', '23', 'UNKNOWN', 'HTTP_502', null]) {
      const progress = { ...base, lastErrorCode: code };
      const result = withKeyShape(progress, HEX);
      assert.equal(result, progress, String(code));
      assert.ok(!('keyShape' in result), String(code));
    }
  });

  test('응답에 키 글자가 없다(8글자씩 잘라 찾아봐도)', () => {
    const text = JSON.stringify(withKeyShape({ ...base, lastErrorCode: '30' }, `"${HEX}"\n`));
    for (let index = 0; index + 8 <= HEX.length; index += 4) assert.ok(!text.includes(HEX.slice(index, index + 8)), HEX.slice(index, index + 8));
  });
});

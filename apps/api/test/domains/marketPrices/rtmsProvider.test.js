import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS, RETRY_DELAY_MS } from '../../../src/domains/marketPrices/marketPriceRules.js';
import { fetchRtmsMonth, fetchRtmsPage, normalizeItem, parseRtmsXml, RtmsError, toNumber } from '../../../src/domains/marketPrices/rtmsProvider.js';
import { EMPTY_XML, KEY_ERROR_XML, RENT_ITEMS, RENT_XML, TRADE_ITEMS, TRADE_XML, wrapResponse } from './fixtures/rtmsResponses.js';

// 테스트용 가짜 키 — 실제 키가 아니다. 오류 메시지에 이 값이 새지 않는지 본다
const FAKE_KEY = 'TEST+KEY/abc==';
let savedKey;
before(() => {
  savedKey = process.env.DATA_GO_KR_SERVICE_KEY;
  process.env.DATA_GO_KR_SERVICE_KEY = FAKE_KEY;
});
after(() => {
  if (savedKey === undefined) delete process.env.DATA_GO_KR_SERVICE_KEY;
  else process.env.DATA_GO_KR_SERVICE_KEY = savedKey;
});

const respond = (xml, { status = 200 } = {}) => ({ ok: status < 400, status, headers: new Headers(), text: async () => xml });
// AbortSignal.timeout 이 끊을 때 나는 오류(Node: DOMException TimeoutError, 옛 코드 23)
const timeoutError = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');
// 헤더는 왔는데 본문을 읽다 시간 초과
const bodyTimeout = () => ({ ok: true, status: 200, headers: new Headers(), text: async () => { throw timeoutError(); } });
// 공공데이터포털 게이트웨이 오류 봉투(KEY_ERROR_XML 과 같은 모양, 코드만 다름)
const gatewayError = (code, authMsg) =>
  `<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>${authMsg}</returnAuthMsg><returnReasonCode>${code}</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
// 결과 코드 23 — 활용 가이드 오류표에 없는 코드라 문구는 지어내지 않는다
const CODE_23_XML = gatewayError('23', 'SERVICE ERROR');
// 응답을 차례로 돌려주는 가짜 fetch(함수면 불러서 던지거나 돌려준다). 부른 횟수를 센다
const sequence = (...steps) => {
  const fake = { count: 0 };
  fake.fetchImpl = async () => {
    const step = steps[Math.min(fake.count, steps.length - 1)];
    fake.count += 1;
    return typeof step === 'function' ? step() : respond(step);
  };
  return fake;
};
const month = { kind: 'RENT', sigunguCode: '11710', yearMonth: '2026-10' };

describe('실거래가 응답 읽기', () => {
  test('매매: 쉼표 금액을 원으로, 빈 칸(" ")은 null, 위치 칸은 원문 그대로', () => {
    const page = parseRtmsXml(TRADE_XML);
    assert.equal(page.resultCode, '000');
    assert.equal(page.totalCount, TRADE_ITEMS.length);
    const deal = normalizeItem('TRADE', page.items[0]);
    assert.equal(deal.dealType, 'SALE');
    assert.equal(deal.aptName, '트리지움');
    assert.equal(deal.price, 303000 * 10000); // "303,000" 만원
    assert.equal(deal.deposit, null);
    assert.equal(deal.monthlyRent, null);
    assert.equal(deal.contractDate, '2026-10-31');
    assert.equal(deal.exclusiveArea, 84.95);
    assert.equal(deal.umdCode, '10100');
    assert.deepEqual(deal.road, { sigunguCode: '11710', roadCode: '3123015', undergroundCode: '0', mainNoText: '00062', subNoText: '00000' });
    assert.equal(deal.cancelled, false);
    assert.equal(normalizeItem('TRADE', page.items[2]).road.undergroundCode, null); // 헬리오시티 — 지상지하 칸이 빈 행
  });

  test('매매: 해제여부(cdealType)가 채워진 거래는 cancelled', () => {
    const deals = parseRtmsXml(TRADE_XML).items.map((item) => normalizeItem('TRADE', item));
    assert.deepEqual(
      deals.map((deal) => [deal.aptName, deal.cancelled]),
      [['트리지움', false], ['주공아파트 5단지', false], ['헬리오시티', false], ['송파센텀레이크', true]],
    );
  });

  test('전월세: 소문자 도로명 칸 · umdCd 없음 · 월세 0 이면 전세, 0 보다 크면 월세', () => {
    const page = parseRtmsXml(RENT_XML);
    assert.equal(page.items.length, RENT_ITEMS.length);
    const deals = page.items.map((item) => normalizeItem('RENT', item));
    assert.deepEqual(deals.map((deal) => deal.dealType), ['JEONSE', 'JEONSE', 'JEONSE', 'MONTHLY', 'MONTHLY', 'JEONSE']);
    const [jeonse, , dash, monthly] = deals;
    assert.equal(jeonse.umdCode, null);
    assert.equal(jeonse.umdName, '풍납동');
    assert.equal(jeonse.road.roadCode, '3123019'); // 원문은 <roadnmcd>
    assert.equal(jeonse.deposit, 49350 * 10000);
    assert.equal(jeonse.monthlyRent, null);
    assert.equal(jeonse.price, null);
    assert.equal(dash.jibun, '413-1');
    assert.equal(monthly.deposit, 25000 * 10000);
    assert.equal(monthly.monthlyRent, 240 * 10000);
    assert.ok(['신규', '갱신', null].includes(monthly.contractType));
    assert.equal(deals[5].road.roadCode, null); // 도로명 없는 행 — 지번 · aptSeq 로 잇는다
    assert.equal(deals[5].aptSeq, '11710-9109');
  });

  test('숫자 읽기: 쉼표 · 빈 칸 · 숫자 아님', () => {
    assert.equal(toNumber('12,000'), 12000);
    assert.equal(toNumber(' '), null);
    assert.equal(toNumber(''), null);
    assert.equal(toNumber('abc'), null);
  });

  test('게이트웨이 오류 봉투(등록되지 않은 키)는 결과 코드 30', () => {
    const page = parseRtmsXml(KEY_ERROR_XML);
    assert.equal(page.resultCode, '30');
    assert.equal(page.items.length, 0);
  });
});

describe('실거래가 받기', () => {
  test('요청 주소: 키는 한 번 인코딩, LAWD_CD · DEAL_YMD(YYYYMM) · 페이지', async () => {
    let seen;
    await fetchRtmsPage({ kind: 'TRADE', sigunguCode: '11710', yearMonth: '2026-10', pageNo: 2, numOfRows: 50 }, {
      fetchImpl: async (url) => {
        seen = new URL(url);
        return respond(EMPTY_XML);
      },
    });
    assert.equal(seen.origin + seen.pathname, 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev');
    assert.equal(seen.searchParams.get('serviceKey'), FAKE_KEY); // 한 번 풀면 원래 키(두 번 인코딩하지 않음)
    assert.equal(seen.searchParams.get('LAWD_CD'), '11710');
    assert.equal(seen.searchParams.get('DEAL_YMD'), '202610');
    assert.equal(seen.searchParams.get('pageNo'), '2');
    assert.equal(seen.searchParams.get('numOfRows'), '50');
  });

  test('totalCount 를 넘을 때까지 다음 페이지, 한 묶음을 거래로 돌려준다', async () => {
    const pages = [wrapResponse(RENT_ITEMS.slice(0, 4), { totalCount: 6, pageNo: 1 }), wrapResponse(RENT_ITEMS.slice(4), { totalCount: 6, pageNo: 2 })];
    const calls = [];
    const result = await fetchRtmsMonth({ kind: 'RENT', sigunguCode: '11710', yearMonth: '2026-10' }, {
      pageSize: 4,
      fetchImpl: async (url) => {
        calls.push(new URL(url).searchParams.get('pageNo'));
        return respond(pages[calls.length - 1]);
      },
    });
    assert.deepEqual(calls, ['1', '2']);
    assert.equal(result.calls, 2);
    assert.equal(result.totalCount, 6);
    assert.equal(result.deals.length, 6);
  });

  test('거래 없는 달(0건 · 03 No Data)은 빈 결과', async () => {
    const empty = await fetchRtmsMonth({ kind: 'TRADE', sigunguCode: '11710', yearMonth: '2026-10' }, { fetchImpl: async () => respond(EMPTY_XML) });
    assert.equal(empty.deals.length, 0);
    const noData = '<response><header><resultCode>03</resultCode><resultMsg>NO_DATA</resultMsg></header><body></body></response>';
    const result = await fetchRtmsPage({ kind: 'TRADE', sigunguCode: '11710', yearMonth: '2026-10' }, { fetchImpl: async () => respond(noData) });
    assert.deepEqual(result, { totalCount: 0, items: [] });
  });

  test('실패는 RtmsError(코드) — 메시지에 키 · 요청 주소가 없다', async () => {
    const cases = [
      [async () => respond(KEY_ERROR_XML), '30'],
      [async () => respond('<html>bad gateway</html>', { status: 502 }), 'HTTP_502'],
      [async () => { throw new TypeError(`fetch failed for https://apis.data.go.kr/?serviceKey=${FAKE_KEY}`); }, 'NETWORK'],
      [async () => { throw timeoutError(); }, 'TIMEOUT'], // 헤더가 8초 안에 안 옴
      [async () => bodyTimeout(), 'TIMEOUT'], // 본문이 8초 안에 안 끝남 — 11/18 에는 이것이 "23" 으로 새어 나갔다
      [async () => respond('x'.repeat(MAX_RESPONSE_BYTES + 1)), 'TOO_LARGE'],
    ];
    for (const [fetchImpl, code] of cases) {
      await assert.rejects(fetchRtmsPage({ kind: 'RENT', sigunguCode: '11710', yearMonth: '2026-10' }, { fetchImpl }), (error) => {
        assert.ok(error instanceof RtmsError);
        assert.equal(error.code, code);
        assert.ok(!error.message.includes(FAKE_KEY) && !error.message.includes('TEST') && !error.message.includes('http'), error.message);
        return true;
      });
    }
  });

  test('키가 없으면 부르지 않고 NO_KEY', async () => {
    delete process.env.DATA_GO_KR_SERVICE_KEY;
    let called = false;
    await assert.rejects(
      fetchRtmsPage({ kind: 'TRADE', sigunguCode: '11710', yearMonth: '2026-10' }, { fetchImpl: async () => { called = true; return respond(EMPTY_XML); } }),
      (error) => error.code === 'NO_KEY',
    );
    assert.equal(called, false);
    process.env.DATA_GO_KR_SERVICE_KEY = FAKE_KEY;
  });
});

describe('실거래가 다시 시도(시간 초과 · 23 만 한 번 더)', () => {
  const sleeper = () => {
    const slept = [];
    return { slept, sleep: async (ms) => { slept.push(ms); } };
  };

  test('23 → 성공: 쉬고 한 번 더 불러 받는다(부른 횟수 2)', async () => {
    const fake = sequence(CODE_23_XML, RENT_XML);
    const { slept, sleep } = sleeper();
    const result = await fetchRtmsMonth(month, { fetchImpl: fake.fetchImpl, sleep });
    assert.equal(result.deals.length, RENT_ITEMS.length);
    assert.equal(result.calls, 2);
    assert.equal(fake.count, 2);
    assert.deepEqual(slept, [RETRY_DELAY_MS]);
    assert.ok(RETRY_DELAY_MS >= 1000 && RETRY_DELAY_MS <= 2000);
  });

  test('23 → 23: 한 번만 더 하고 실패(코드 23, 부른 횟수 2)', async () => {
    const fake = sequence(CODE_23_XML, CODE_23_XML, RENT_XML);
    const { slept, sleep } = sleeper();
    await assert.rejects(fetchRtmsMonth(month, { fetchImpl: fake.fetchImpl, sleep }), (error) => {
      assert.ok(error instanceof RtmsError);
      assert.equal(error.code, '23');
      assert.equal(error.calls, 2);
      return true;
    });
    assert.equal(fake.count, 2); // 세 번째는 부르지 않는다
    assert.deepEqual(slept, [RETRY_DELAY_MS]);
  });

  test('시간 초과 → 성공: 헤더 시간 초과 · 본문 시간 초과 모두 한 번 더', async () => {
    for (const first of [() => { throw timeoutError(); }, bodyTimeout]) {
      const fake = sequence(first, RENT_XML);
      const { slept, sleep } = sleeper();
      const result = await fetchRtmsMonth(month, { fetchImpl: fake.fetchImpl, sleep });
      assert.equal(result.deals.length, RENT_ITEMS.length);
      assert.equal(result.calls, 2);
      assert.deepEqual(slept, [RETRY_DELAY_MS]);
    }
  });

  test('시간 초과 → 시간 초과: 실패(코드 TIMEOUT, 부른 횟수 2)', async () => {
    const fake = sequence(bodyTimeout, bodyTimeout, RENT_XML);
    const { sleep } = sleeper();
    await assert.rejects(fetchRtmsMonth(month, { fetchImpl: fake.fetchImpl, sleep }), (error) => error.code === 'TIMEOUT' && error.calls === 2);
    assert.equal(fake.count, 2);
  });

  test('다른 오류(키 · 파라미터 · 일일 한도 · HTTP · 연결)는 다시 시도하지 않는다', async () => {
    const cases = [
      [KEY_ERROR_XML, '30'],
      [gatewayError('22', 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR'), '22'],
      [gatewayError('10', 'INVALID_REQUEST_PARAMETER_ERROR'), '10'],
      [() => respond('<html>bad gateway</html>', { status: 502 }), 'HTTP_502'],
      [() => { throw new TypeError('fetch failed'); }, 'NETWORK'],
    ];
    for (const [first, code] of cases) {
      const fake = sequence(first, RENT_XML);
      const { slept, sleep } = sleeper();
      await assert.rejects(fetchRtmsMonth(month, { fetchImpl: fake.fetchImpl, sleep }), (error) => {
        assert.equal(error.code, code);
        assert.equal(error.calls, 1);
        return true;
      });
      assert.equal(fake.count, 1, code);
      assert.deepEqual(slept, [], code);
    }
  });

  test('실행 시간 한도 안에 "쉬기 + 요청 하나" 가 안 들어가면 다시 하지 않는다', async () => {
    const fake = sequence(CODE_23_XML, RENT_XML);
    const { slept, sleep } = sleeper();
    const deadline = 100_000;
    const now = () => deadline - (RETRY_DELAY_MS + REQUEST_TIMEOUT_MS) + 1;
    await assert.rejects(fetchRtmsMonth(month, { fetchImpl: fake.fetchImpl, sleep, now, deadline }), (error) => error.code === '23' && error.calls === 1);
    assert.equal(fake.count, 1);
    assert.deepEqual(slept, []);
  });

  test('여러 쪽 묶음: 둘째 쪽에서 23 → 성공이면 부른 횟수 3', async () => {
    const pages = [wrapResponse(RENT_ITEMS.slice(0, 4), { totalCount: 6, pageNo: 1 }), CODE_23_XML, wrapResponse(RENT_ITEMS.slice(4), { totalCount: 6, pageNo: 2 })];
    const fake = sequence(...pages);
    const { sleep } = sleeper();
    const result = await fetchRtmsMonth(month, { fetchImpl: fake.fetchImpl, sleep, pageSize: 4 });
    assert.equal(result.deals.length, 6);
    assert.equal(result.calls, 3);
  });
});

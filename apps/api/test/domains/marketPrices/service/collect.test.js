import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  REFRESH_MIN_AGE_MS,
  RELINK_FIRST_BUDGET_MS,
  REQUEST_TIMEOUT_MS,
  RETRY_DELAY_MS,
  RUN_BUDGET_MS,
  WAITING_FIRST_BUDGET_SHARE,
} from '../../../../src/domains/marketPrices/marketPriceRules.js';
import { retentionMonths } from '../../../../src/domains/marketPrices/months.js';
import { createTaskQueue, planCollectionTasks, planRelink, runRelink } from '../../../../src/domains/marketPrices/service/collect.js';

const NOW = Date.parse('2026-11-17T03:00:00Z'); // 한국 시간 11/17 12:00
const months = retentionMonths(new Date(NOW));
const HOUR = 60 * 60 * 1000;
const done = (sigunguCode, yearMonth, dealKind, { collectedAgo = HOUR, attemptedAgo = collectedAgo } = {}) => ({
  sigunguCode,
  yearMonth,
  dealKind,
  collectedAt: new Date(NOW - collectedAgo),
  attemptedAt: new Date(NOW - attemptedAgo),
});

describe('수집 할 일 고르기', () => {
  test('보관 기간 = 이번 달(한국 시간)부터 거꾸로 13개월(완성된 달 12개 + 이번 달)', () => {
    assert.equal(months.length, 13);
    assert.equal(months[0], '2025-11');
    assert.equal(months[12], '2026-11');
    // 한국 시간으로 달이 바뀌는 순간(UTC 11/30 15:00 = 한국 12/1 00:00)
    assert.equal(retentionMonths(new Date('2026-11-30T15:00:00Z'))[12], '2026-12');
  });

  test('처음 보는 시군구는 13개월 × 매매 · 전월세 = 26 묶음, 최근 달 · 매매부터', () => {
    const tasks = planCollectionTasks({ sigunguCodes: ['11710'], months, collections: [], now: NOW });
    assert.equal(tasks.length, 26);
    assert.ok(tasks.every((task) => task.reason === 'BACKFILL'));
    assert.deepEqual(tasks.slice(0, 3).map((t) => `${t.yearMonth} ${t.kind}`), ['2026-11 TRADE', '2026-11 RENT', '2026-10 TRADE']);
  });

  test('다 모은 시군구는 최근 3개월만 다시 — 마지막으로 모은 지 20시간이 지났을 때만', () => {
    const fresh = months.flatMap((month) => ['TRADE', 'RENT'].map((kind) => done('11710', month, kind)));
    assert.equal(planCollectionTasks({ sigunguCodes: ['11710'], months, collections: fresh, now: NOW }).length, 0);
    const stale = months.flatMap((month) => ['TRADE', 'RENT'].map((kind) => done('11710', month, kind, { collectedAgo: REFRESH_MIN_AGE_MS })));
    const tasks = planCollectionTasks({ sigunguCodes: ['11710'], months, collections: stale, now: NOW });
    assert.equal(tasks.length, 6);
    assert.ok(tasks.every((task) => task.reason === 'REFRESH'));
    assert.deepEqual([...new Set(tasks.map((t) => t.yearMonth))].sort(), ['2026-09', '2026-10', '2026-11']);
  });

  test('채우기가 다시 모으기보다 먼저, 그 안에서 오래 안 시도한 묶음부터(실패한 묶음은 시도 시각 기준)', () => {
    const collected = months.flatMap((month) => ['TRADE', 'RENT'].map((kind) => done('11710', month, kind, { collectedAgo: 2 * REFRESH_MIN_AGE_MS })));
    const failedLongAgo = { sigunguCode: '26350', yearMonth: '2026-01', dealKind: 'TRADE', collectedAt: null, attemptedAt: new Date(NOW - 50 * HOUR) };
    const failedRecently = { sigunguCode: '26350', yearMonth: '2026-02', dealKind: 'TRADE', collectedAt: null, attemptedAt: new Date(NOW - HOUR) };
    const tasks = planCollectionTasks({ sigunguCodes: ['11710', '26350'], months, collections: [...collected, failedLongAgo, failedRecently], now: NOW });
    const firstRefresh = tasks.findIndex((t) => t.reason === 'REFRESH');
    assert.ok(tasks.slice(0, firstRefresh).every((t) => t.reason === 'BACKFILL'));
    assert.ok(tasks.slice(firstRefresh).every((t) => t.reason === 'REFRESH'));
    const order = tasks.filter((t) => t.sigunguCode === '26350').map((t) => `${t.yearMonth} ${t.kind}`);
    // 한 번도 안 한 묶음(시도 시각 0) → 50시간 전 실패 → 1시간 전 실패
    assert.ok(order.indexOf('2026-01 TRADE') > order.indexOf('2026-11 TRADE'));
    assert.ok(order.indexOf('2026-02 TRADE') > order.indexOf('2026-01 TRADE'));
    assert.equal(order.at(-1), '2026-02 TRADE');
  });
});

describe('수집 순서 — 대기 작업(사용자가 시세 화면을 연 곳)이 있는 시군구 먼저 (#267)', () => {
  const label = (t) => `${t.sigunguCode} ${t.yearMonth} ${t.kind} ${t.reason}`;
  // 11/27 배포 노원구 모양: 11350 은 8개월 모음(다시 모으기 대상) · 5개월은 이틀 전 실패(30), 11710 · 26350 은 한 번도 안 함
  const nowonCollections = () => {
    const rows = [];
    months.forEach((month, index) => {
      for (const kind of ['TRADE', 'RENT']) {
        if (index < 5) rows.push({ sigunguCode: '11350', yearMonth: month, dealKind: kind, collectedAt: null, attemptedAt: new Date(NOW - 50 * HOUR) });
        else rows.push(done('11350', month, kind, { collectedAgo: REFRESH_MIN_AGE_MS }));
      }
    });
    return rows;
  };
  const plan = (waitingSigunguCodes) =>
    planCollectionTasks({ sigunguCodes: ['11350', '11710', '26350'], months, collections: nowonCollections(), now: NOW, ...(waitingSigunguCodes ? { waitingSigunguCodes } : {}) });

  test('대기 작업 있는 구의 채우기가 맨 앞 → 나머지 채우기 → 다시 모으기, 같은 묶음 안은 오래전에 시도한 것부터', () => {
    const tasks = plan(['11350']);
    // 대기 작업이 없으면 한 번도 안 한 11710 · 26350 (시도 시각 0)이 이틀 전 실패한 11350 보다 앞이다 — 그래서 11/27 새벽에 차례가 안 왔다
    assert.equal(plan().findIndex((t) => t.sigunguCode === '11350' && t.reason === 'BACKFILL'), 52);
    const groups = tasks.map((t) => (t.waiting ? 'WAITING_BACKFILL' : t.reason));
    assert.deepEqual([...new Set(groups)], ['WAITING_BACKFILL', 'BACKFILL', 'REFRESH']);
    assert.equal(groups.filter((g) => g === 'WAITING_BACKFILL').length, 10); // 노원구 5개월 × 매매 · 전월세
    assert.ok(tasks.slice(0, 10).every((t) => t.sigunguCode === '11350' && t.reason === 'BACKFILL'));
    // 같은 묶음 안: 시도 시각이 같으면 최근 달 · 매매 먼저(지금 규칙 그대로)
    assert.deepEqual(tasks.slice(0, 3).map(label), [`11350 ${months[4]} TRADE BACKFILL`, `11350 ${months[4]} RENT BACKFILL`, `11350 ${months[3]} TRADE BACKFILL`]);
    // 나머지 채우기는 시군구 순, 다시 모으기는 맨 뒤(대기 작업 구의 다시 모으기도 뒤 — 앞에 세우는 것은 채우기만)
    assert.deepEqual([...new Set(tasks.filter((t) => t.reason === 'BACKFILL' && !t.waiting).map((t) => t.sigunguCode))], ['11710', '26350']);
    assert.ok(tasks.slice(-6).every((t) => t.sigunguCode === '11350' && t.reason === 'REFRESH' && !t.waiting));
  });

  test('대기 작업이 없으면(또는 대상 밖 구뿐이면) 지금 순서와 같고, usualRank 가 그 자리', () => {
    const usual = plan();
    assert.deepEqual(plan([]).map(label), usual.map(label));
    assert.deepEqual(plan(['41135']).map(label), usual.map(label));
    assert.ok(usual.every((t, index) => t.usualRank === index && t.waiting === false));
    // 지금 순서: 채우기(한 번도 안 한 것 → 이틀 전 실패) → 다시 모으기
    assert.deepEqual([...new Set(usual.map((t) => `${t.sigunguCode} ${t.reason}`))], ['11710 BACKFILL', '26350 BACKFILL', '11350 BACKFILL', '11350 REFRESH']);
    // 대기 작업이 있으면 usualRank 는 이 순서의 자리 그대로
    const byLabel = new Map(usual.map((t) => [label(t), t.usualRank]));
    assert.ok(plan(['11350']).every((t) => byLabel.get(label(t)) === t.usualRank));
  });

  test('대기 작업 구가 시간 초과로 계속 실패해도, 시간 한도의 절반이 지나면 다른 구 채우기가 같은 실행 안에서 시작된다', () => {
    // 수집 한 번을 흉내: 대기 작업 구(26350)는 묶음마다 8초 시간 초과 → 1.5초 쉬고 → 다시 8초 시간 초과, 다른 구(11710)는 한 묶음 0.3초
    const tasks = planCollectionTasks({ sigunguCodes: ['11710', '26350'], months, collections: [], now: NOW, waitingSigunguCodes: ['26350'] });
    let clock = NOW;
    const deadline = NOW + RUN_BUDGET_MS;
    const queue = createTaskQueue(tasks, { now: () => clock, waitingUntil: NOW + RUN_BUDGET_MS * WAITING_FIRST_BUDGET_SHARE });
    const started = [];
    while (queue.remaining() > 0 && clock + REQUEST_TIMEOUT_MS <= deadline) {
      const task = queue.take();
      started.push({ sigunguCode: task.sigunguCode, at: clock - NOW });
      clock += task.sigunguCode === '26350' ? REQUEST_TIMEOUT_MS + RETRY_DELAY_MS + REQUEST_TIMEOUT_MS : 300;
    }
    const other = started.filter((s) => s.sigunguCode === '11710');
    // 절반(22.5초) 전에 시작한 것은 모두 대기 작업 구 — 0초 · 17.5초에 둘
    assert.deepEqual(started.filter((s) => s.at < RUN_BUDGET_MS * WAITING_FIRST_BUDGET_SHARE).map((s) => s.sigunguCode), ['26350', '26350']);
    // 그 뒤(35초)부터는 지금 순서로 섞여 다른 구 채우기가 시작된다(시군구 순이라 11710 이 먼저)
    assert.ok(other.length >= 1, JSON.stringify(started));
    assert.equal(other[0].at, 2 * (REQUEST_TIMEOUT_MS + RETRY_DELAY_MS + REQUEST_TIMEOUT_MS));
    // 안전장치가 없었다면(계속 대기 작업 구 먼저) 같은 시간에 다른 구는 하나도 시작하지 못한다
    let noGuardClock = NOW;
    const noGuard = createTaskQueue(tasks, { now: () => noGuardClock, waitingUntil: Number.POSITIVE_INFINITY });
    const noGuardStarted = [];
    while (noGuard.remaining() > 0 && noGuardClock + REQUEST_TIMEOUT_MS <= deadline) {
      const task = noGuard.take();
      noGuardStarted.push(task.sigunguCode);
      noGuardClock += task.sigunguCode === '26350' ? REQUEST_TIMEOUT_MS + RETRY_DELAY_MS + REQUEST_TIMEOUT_MS : 300;
    }
    assert.deepEqual(noGuardStarted, ['26350', '26350', '26350']);
  });

  test('꺼내기: 절반이 지나기 전에는 planCollectionTasks 순서, 지난 뒤에는 남은 것만 usualRank 순서 — 하나도 빠지거나 겹치지 않는다', () => {
    const tasks = plan(['11350']);
    let clock = NOW;
    const queue = createTaskQueue(tasks, { now: () => clock, waitingUntil: NOW + 1000 });
    const first = [queue.take(), queue.take()];
    assert.deepEqual(first.map(label), tasks.slice(0, 2).map(label));
    clock = NOW + 1000;
    const rest = [];
    while (queue.remaining() > 0) rest.push(queue.take());
    assert.deepEqual(rest.map((t) => t.usualRank), [...rest.map((t) => t.usualRank)].sort((a, b) => a - b));
    assert.deepEqual([...first, ...rest].map(label).sort(), tasks.map(label).sort());
    assert.equal(queue.take(), undefined);
  });
});

describe('다시 잇기 먼저 — 순서 · 상한 (#270)', () => {
  test('안 이어진 거래가 있는 시군구만, 대기 작업이 있는 시군구(사용자가 연 곳)부터, 그다음 나머지(대상 순서 그대로)', () => {
    const order = planRelink({ targets: ['11350', '11440', '11710', '26350'], waiting: ['26350', '11440'], withUnlinked: ['11350', '11710', '26350', '11440'] });
    assert.deepEqual(order, ['11440', '26350', '11350', '11710']);
    // 안 이어진 거래가 없는 시군구는 빠진다(대기 작업이 있어도)
    assert.deepEqual(planRelink({ targets: ['11350', '11710'], waiting: ['11710'], withUnlinked: ['11350'] }), ['11350']);
    assert.deepEqual(planRelink({ targets: ['11350'], waiting: [], withUnlinked: [] }), []);
  });

  test('상한을 넘으면 거기서 멈춘다 — 시군구 하나를 시작하기 전에만 보고(안에서는 끊지 않음), 남은 시군구는 다음 실행으로', async () => {
    let clock = 0;
    const done = [];
    const relinkOne = async (code) => {
      clock += 5000; // 한 시군구에 5초
      done.push(code);
      return 3;
    };
    const result = await runRelink({ order: ['a', 'b', 'c', 'd'], now: () => clock, budgetMs: 8000, relinkOne });
    // 0초에 a(→5초), 5초에 b(→10초), 10초 ≥ 8초라 c 는 시작하지 않는다
    assert.deepEqual(done, ['a', 'b']);
    assert.deepEqual(result, { sigungus: 2, relinked: 6, elapsedMs: 10000, capped: true });
  });

  test('안 이어진 거래가 없으면(순서가 비면) 바로 끝난다 — 상한에 걸리지 않음', async () => {
    let calls = 0;
    const result = await runRelink({ order: [], now: () => 0, budgetMs: 8000, relinkOne: async () => (calls += 1) });
    assert.deepEqual(result, { sigungus: 0, relinked: 0, elapsedMs: 0, capped: false });
    assert.equal(calls, 0);
  });

  test('상한은 규칙 파일 값(8초) — 실행 한도 45초 안', () => {
    assert.equal(RELINK_FIRST_BUDGET_MS, 8000);
    assert.ok(RELINK_FIRST_BUDGET_MS < RUN_BUDGET_MS);
  });
});

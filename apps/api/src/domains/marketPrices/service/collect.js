// 실거래가 수집(정기 실행 GET /api/cron/market-prices) — 시세 계획서 5절. 규칙 값은 marketPriceRules.js.
// 한 번 실행에서(우선순위 순): ① 처음 보는 묶음(한 번도 못 모은 달)의 13개월 채우기 — 대기 작업(사용자가 시세 화면을 연 곳)이 있는 시군구 먼저
// ② 최근 3개월 다시 모으기. 대기 작업 구를 앞에 세우는 것은 시간 한도의 절반까지(규칙 파일 "모으는 순서").
// 묶음 = (시군구, 계약월, 매매/전월세). 묶음마다 그 행을 지우고 새로 넣는다(한 트랜잭션 — 해제된 거래가 빠지게).
// 시간이 모자라면 오래 안 시도한 묶음부터 하고 남은 것은 다음 번.
// 저장된 거래 다시 잇기(원천을 다시 부르지 않고 나중에 등록된 단지 · 바뀐 규칙으로 잇기)는 실행을 시작하자마자 먼저(8초 상한) —
// 수집은 시간 한도를 넘길 수 있어 끝에 두면 건너뛰어진다(#270). 끝의 다시 잇기는 시간이 남을 때만 하는 덤.
// 원천은 하나씩 부르고(CONCURRENCY), 시간 초과 · 23 은 실행 한도 안에서 한 번 더 부른다(rtmsProvider.fetchRtmsMonth).

import { prisma } from '../../../platform/prismaClient.js';
import { listAllOwnedLegalDongCodes } from '../../community/platformBridge.js';
import { buildLinkIndex, dealLotKey, linkDeals, linkStoredKeys, roadKeyOf, usableKeys } from '../linkComplex.js';
import {
  CONCURRENCY,
  REFRESH_MIN_AGE_MS,
  REFRESH_MONTHS,
  RELINK_FIRST_BUDGET_MS,
  REQUEST_TIMEOUT_MS,
  RUN_BUDGET_MS,
  TASK_GROUPS,
  WAITING_FIRST_BUDGET_SHARE,
  safeErrorCode,
} from '../marketPriceRules.js';
import { retentionMonths } from '../months.js';
import { fetchRtmsMonth } from '../rtmsProvider.js';
import { completeBackfillJobs, listPendingBackfillSigunguCodes } from './backfillJobs.js';

const KINDS = ['TRADE', 'RENT'];
const clip = (text, length) => (text ? String(text).slice(0, length) : null);
const toBigInt = (won) => (won === null || won === undefined ? null : BigInt(won));

// 대상 시군구 — 커뮤니티를 읽을 수 있는 임대인(활성 소유, 인증 취소 아님)의 단지가 있는 곳 + 대기 작업이 걸린 곳.
// pending: 이미 읽은 대기 작업 시군구(없으면 여기서 읽는다)
export const listTargetSigunguCodes = async (pending) => {
  const legalDongCodes = await listAllOwnedLegalDongCodes();
  const waiting = pending ?? (await listPendingBackfillSigunguCodes());
  return [...new Set([...legalDongCodes.map((code) => code.slice(0, 5)), ...waiting])].sort();
};

// 할 일 고르기(순수 함수). collections: 그 시군구들 · 달들의 market_collections 행, waitingSigunguCodes: 대기 작업이 걸린 시군구
// 반환: [{ sigunguCode, yearMonth, kind, reason: 'BACKFILL' | 'REFRESH', waiting, usualRank }] — 앞에서부터 한다(규칙 파일 "모으는 순서"):
//   대기 작업 구의 채우기(waiting true) → 나머지 채우기 → 다시 모으기.
//   usualRank = 대기 작업을 따지지 않은 순서(채우기 → 다시 모으기)의 자리 — 시간 한도의 절반이 지나면 남은 것을 이 순서로 섞는다(createTaskQueue)
export const planCollectionTasks = ({ sigunguCodes, months, collections, now, waitingSigunguCodes = [] }) => {
  const byKey = new Map(collections.map((row) => [`${row.sigunguCode}|${row.yearMonth}|${row.dealKind}`, row]));
  const recent = new Set(months.slice(-REFRESH_MONTHS));
  const waiting = new Set(waitingSigunguCodes);
  const tasks = [];
  for (const sigunguCode of sigunguCodes) {
    for (const yearMonth of months) {
      for (const kind of KINDS) {
        const row = byKey.get(`${sigunguCode}|${yearMonth}|${kind}`);
        const attemptedAt = row?.attemptedAt ? new Date(row.attemptedAt).getTime() : 0;
        if (!row?.collectedAt) tasks.push({ sigunguCode, yearMonth, kind, reason: 'BACKFILL', waiting: waiting.has(sigunguCode), attemptedAt });
        else if (recent.has(yearMonth) && now - new Date(row.collectedAt).getTime() >= REFRESH_MIN_AGE_MS) {
          tasks.push({ sigunguCode, yearMonth, kind, reason: 'REFRESH', waiting: false, attemptedAt });
        }
      }
    }
  }
  // 대기 작업을 따지지 않은 순서: 채우기 먼저, 그 안에서 오래 안 시도한 묶음(한 번도 안 한 것 = 0)부터, 같으면 시군구 · 최근 달 · 매매 먼저
  tasks.sort(
    (a, b) =>
      TASK_GROUPS.indexOf(a.reason) - TASK_GROUPS.indexOf(b.reason) ||
      a.attemptedAt - b.attemptedAt ||
      a.sigunguCode.localeCompare(b.sigunguCode) ||
      b.yearMonth.localeCompare(a.yearMonth) ||
      KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind),
  );
  tasks.forEach((task, index) => {
    task.usualRank = index;
  });
  // 대기 작업 구의 채우기를 맨 앞으로 — 그 밖의 묶음 사이 순서는 그대로
  const groupOf = (task) => TASK_GROUPS.indexOf(task.waiting ? 'WAITING_BACKFILL' : task.reason);
  tasks.sort((a, b) => groupOf(a) - groupOf(b) || a.usualRank - b.usualRank);
  return tasks.map(({ attemptedAt, ...task }) => task);
};

// 할 일 꺼내기 — 처음에는 planCollectionTasks 순서(대기 작업 구의 채우기 먼저), waitingUntil(밀리초 시각)이 지나면
// 아직 시작하지 않은 묶음을 usualRank 순서로 다시 세운다(대기 작업 구가 다른 구를 밀어내지 않게 — 규칙 파일 WAITING_FIRST_BUDGET_SHARE)
export const createTaskQueue = (tasks, { now, waitingUntil }) => {
  const queue = [...tasks];
  let mixed = false;
  return {
    remaining: () => queue.length,
    take: () => {
      if (!mixed && now() >= waitingUntil) {
        queue.sort((a, b) => a.usualRank - b.usualRank);
        mixed = true;
      }
      return queue.shift();
    },
  };
};

// 시군구 하나의 잇기 색인 — 그 시군구 단지(이름 포함) · 법정동 · 앞서 도로명 · 지번으로 이어진 거래의 aptSeq ·
// 저장된 거래 이름(같은 법정동의 번호 단지 세기 — 도로명 키가 같고 지번이 다를 때 이름 확인, #270)
export const loadLinkIndex = async (sigunguCode) => {
  const [complexes, regions, hints, dealNames] = await Promise.all([
    prisma.complex.findMany({
      where: { regionId: { startsWith: sigunguCode } },
      select: {
        id: true, sourceKey: true, regionId: true, isMountain: true, mainLot: true, subLot: true, roadCode: true, isUnderground: true, buildingMainNo: true, buildingSubNo: true,
        name: true, buildingName: true,
      },
    }),
    prisma.region.findMany({ where: { id: { startsWith: sigunguCode } }, select: { id: true, dongName: true } }),
    prisma.marketDeal.findMany({
      where: { sigunguCode, complexId: { not: null }, aptSeq: { not: null }, linkMethod: { in: ['ROAD', 'JIBUN'] } },
      select: { aptSeq: true, complexId: true },
      distinct: ['aptSeq', 'complexId'],
    }),
    prisma.marketDeal.findMany({
      where: { sigunguCode, legalDongCode: { not: null }, aptName: { not: null } },
      select: { legalDongCode: true, aptName: true },
      distinct: ['legalDongCode', 'aptName'],
    }),
  ]);
  return buildLinkIndex({ complexes, regions, aptSeqHints: hints.map((row) => [row.aptSeq, row.complexId]), dealNames });
};

// 묶음 하나: 받기 → 해제 빼기 → 잇기 → 지우고 넣기(한 트랜잭션). 받기에 실패하면(다시 시도까지 실패) 묶음은 그대로 두고 실패만 적는다
const collectOne = async (task, { fetchImpl, getIndex, nowDate, now, deadline, sleep }) => {
  const { sigunguCode, yearMonth, kind } = task;
  const where = { sigunguCode_yearMonth_dealKind: { sigunguCode, yearMonth, dealKind: kind } };
  let calls = 0;
  try {
    const fetched = await fetchRtmsMonth({ kind, sigunguCode, yearMonth }, { fetchImpl, now, deadline, ...(sleep ? { sleep } : {}) });
    const { deals } = fetched;
    calls = fetched.calls;
    const kept = deals.filter((deal) => !deal.cancelled && deal.contractDate);
    const linked = linkDeals(kept, await getIndex(sigunguCode));
    const collectedAt = nowDate();
    const rows = linked.map((deal) => ({
      dealKind: kind,
      dealType: deal.dealType,
      sigunguCode,
      contractYearMonth: yearMonth,
      legalDongCode: deal.legalDongCode,
      complexId: deal.complexId,
      linkMethod: deal.linkMethod,
      roadKey: roadKeyOf(deal.road),
      lotKey: dealLotKey(deal, deal.legalDongCode),
      aptSeq: clip(deal.aptSeq, 20),
      aptName: clip(deal.aptName, 100),
      jibun: clip(deal.jibun, 20),
      exclusiveArea: deal.exclusiveArea,
      floor: deal.floor,
      contractDate: new Date(`${deal.contractDate}T00:00:00Z`),
      price: toBigInt(deal.price),
      deposit: toBigInt(deal.deposit),
      monthlyRent: toBigInt(deal.monthlyRent),
      contractType: clip(deal.contractType, 4),
      collectedAt,
    }));
    await prisma.$transaction([
      prisma.marketDeal.deleteMany({ where: { sigunguCode, contractYearMonth: yearMonth, dealKind: kind } }),
      prisma.marketDeal.createMany({ data: rows }),
      prisma.marketCollection.upsert({
        where,
        create: { sigunguCode, yearMonth, dealKind: kind, status: 'SUCCEEDED', dealCount: rows.length, collectedAt, attemptedAt: collectedAt },
        update: { status: 'SUCCEEDED', dealCount: rows.length, collectedAt, attemptedAt: collectedAt, lastErrorCode: null },
      }),
    ]);
    return { ok: true, calls, saved: rows.length, linked: rows.filter((row) => row.complexId).length, cancelled: deals.length - kept.length };
  } catch (error) {
    const attemptedAt = nowDate();
    // 코드만 남긴다(메시지에는 주소가 섞일 수 있다). 영문 · 숫자 · 밑줄 30자가 아니면 UNKNOWN — 규칙 파일 safeErrorCode
    const code = safeErrorCode(error?.code ?? error?.name ?? 'ERROR');
    await prisma.marketCollection.upsert({
      where,
      create: { sigunguCode, yearMonth, dealKind: kind, status: 'FAILED', attemptedAt, lastErrorCode: code },
      update: { status: 'FAILED', attemptedAt, lastErrorCode: code },
    });
    // 받기 실패면 오류에 실제로 부른 횟수가 붙어 있다. 받은 뒤 저장에서 실패했으면 받을 때 부른 횟수
    return { ok: false, calls: error?.calls ?? calls, code };
  }
};

// 원천을 다시 부르지 않고 잇기 — 아직 못 이은 거래 중 지금 등록된 단지의 키와 맞는 것만 DB 에서 골라 잇는다(나중에 등록된 단지도 보관 기간 전체가 보이게)
export const relinkSigungu = async (sigunguCode, index) => {
  const { roadKeys, lotKeys } = usableKeys(index);
  let relinked = 0;
  const apply = async (candidates) => {
    const groups = new Map();
    for (const deal of candidates) {
      const { complexId, linkMethod } = linkStoredKeys(deal, index);
      if (!complexId) continue;
      const key = `${complexId}|${linkMethod}`;
      if (!groups.has(key)) groups.set(key, { complexId, linkMethod, ids: [] });
      groups.get(key).ids.push(deal.id);
      if (deal.aptSeq && linkMethod !== 'APT_SEQ' && !index.byAptSeq.has(deal.aptSeq)) index.byAptSeq.set(deal.aptSeq, complexId);
    }
    for (const { complexId, linkMethod, ids } of groups.values()) {
      const result = await prisma.marketDeal.updateMany({ where: { id: { in: ids }, complexId: null }, data: { complexId, linkMethod } });
      relinked += result.count;
    }
  };
  // aptName · legalDongCode 는 도로명 키가 같고 지번이 다를 때 이름 확인용(#270 — 수집할 때 잇기와 같은 판정)
  const select = { id: true, roadKey: true, lotKey: true, aptSeq: true, aptName: true, legalDongCode: true };
  if (roadKeys.length || lotKeys.length) {
    await apply(
      await prisma.marketDeal.findMany({ where: { sigunguCode, complexId: null, OR: [{ roadKey: { in: roadKeys } }, { lotKey: { in: lotKeys } }] }, select }),
    );
  }
  const { aptSeqs } = usableKeys(index);
  if (aptSeqs.length) await apply(await prisma.marketDeal.findMany({ where: { sigunguCode, complexId: null, aptSeq: { in: aptSeqs } }, select }));
  return relinked;
};

// 잇기 규칙이 바뀌었을 때 — 그 시군구 거래의 잇기를 모두 풀고 저장해 둔 잇기 키로 처음부터 다시 잇는다(원천을 부르지 않는다).
// 푼 뒤에 색인을 읽어야 옛 잇기에서 배운 aptSeq 가 다시 쓰이지 않는다. 반환 { unlinked, relinked }
export const rebuildSigunguLinks = async (sigunguCode) => {
  const { count: unlinked } = await prisma.marketDeal.updateMany({ where: { sigunguCode, complexId: { not: null } }, data: { complexId: null, linkMethod: null } });
  const relinked = await relinkSigungu(sigunguCode, await loadLinkIndex(sigunguCode));
  return { unlinked, relinked };
};

// ===== 다시 잇기 먼저(#270, 규칙 파일 RELINK_FIRST_BUDGET_MS) =====
// 수집은 시간 한도를 넘길 수 있어 끝에 두면 건너뛰어진다. 다시 잇기는 DB 만 써서 가벼우니 실행을 시작하자마자 먼저 한다.

// 다시 이을 시군구 순서(순수 함수) — 안 이어진 거래가 있는 시군구만, 대기 작업이 있는 시군구(사용자가 연 곳)부터, 그다음 나머지(대상 순서 그대로)
export const planRelink = ({ targets, waiting = [], withUnlinked }) => {
  const unlinked = new Set(withUnlinked);
  const waitingSet = new Set(waiting);
  const list = targets.filter((code) => unlinked.has(code));
  return [...list.filter((code) => waitingSet.has(code)), ...list.filter((code) => !waitingSet.has(code))];
};

// 순서대로 다시 잇기 — 시군구 하나를 시작하기 전에 쓴 시간을 보고, budgetMs 를 넘었으면 거기서 멈춘다(남은 시군구는 다음 실행).
// relinkOne(시군구) → 이어진 거래 수. 반환 { sigungus(다시 이은 시군구 수), relinked(이어진 거래 수), elapsedMs, capped(상한에 걸렸나) }
export const runRelink = async ({ order, now, budgetMs, relinkOne }) => {
  const startedAt = now();
  const result = { sigungus: 0, relinked: 0, elapsedMs: 0, capped: false };
  for (const sigunguCode of order) {
    if (now() - startedAt >= budgetMs) {
      result.capped = true;
      break;
    }
    result.relinked += await relinkOne(sigunguCode);
    result.sigungus += 1;
  }
  result.elapsedMs = now() - startedAt;
  return result;
};

// 정기 실행 한 번. sigunguCodes 를 주면 그곳만(로컬 확인용), budgetMs 로 시간 한도를, sleep 으로 다시 시도 전 쉬기를,
// relinkBudgetMs 로 먼저 하는 다시 잇기의 상한을 바꾼다(테스트).
export const collectMarketPrices = async ({ fetchImpl, now = Date.now, budgetMs = RUN_BUDGET_MS, sigunguCodes, sleep, relinkBudgetMs = RELINK_FIRST_BUDGET_MS } = {}) => {
  const startedAt = now();
  // 수집 마감은 실행 시작 기준 그대로 — 먼저 하는 다시 잇기에 쓴 시간만큼 수집이 줄어든다
  const deadline = startedAt + budgetMs;
  const nowDate = () => new Date(now());
  const pending = await listPendingBackfillSigunguCodes();
  const targets = sigunguCodes ?? (await listTargetSigunguCodes(pending));

  // 다시 잇기 먼저(DB 만) — 안 이어진 거래가 있는 시군구만, 대기 작업 시군구부터, 상한까지
  const unlinked = await prisma.marketDeal.groupBy({ by: ['sigunguCode'], where: { sigunguCode: { in: targets }, complexId: null }, _count: { _all: true } });
  const relinkFirst = await runRelink({
    order: planRelink({ targets, waiting: pending, withUnlinked: unlinked.map((row) => row.sigunguCode) }),
    now,
    budgetMs: relinkBudgetMs,
    relinkOne: async (sigunguCode) => relinkSigungu(sigunguCode, await loadLinkIndex(sigunguCode)),
  });

  const months = retentionMonths(new Date(startedAt));
  const collections = await prisma.marketCollection.findMany({ where: { sigunguCode: { in: targets }, yearMonth: { in: months } } });
  const tasks = planCollectionTasks({ sigunguCodes: targets, months, collections, now: startedAt, waitingSigunguCodes: pending });
  const queue = createTaskQueue(tasks, { now, waitingUntil: startedAt + budgetMs * WAITING_FIRST_BUDGET_SHARE });

  const indexes = new Map();
  const getIndex = (sigunguCode) => {
    if (!indexes.has(sigunguCode)) indexes.set(sigunguCode, loadLinkIndex(sigunguCode));
    return indexes.get(sigunguCode);
  };
  const summary = {
    targets: targets.length, planned: tasks.length, backfill: tasks.filter((t) => t.reason === 'BACKFILL').length, done: 0, failed: 0, skipped: 0, calls: 0, saved: 0, linked: 0, cancelled: 0, failures: [],
    relinkFirst,
  };

  const worker = async () => {
    // 요청 하나 + 저장 몫이 남아 있을 때만 새 묶음을 시작한다
    while (queue.remaining() > 0 && now() + REQUEST_TIMEOUT_MS <= deadline) {
      const task = queue.take();
      const result = await collectOne(task, { fetchImpl, getIndex, nowDate, now, deadline, sleep });
      summary.calls += result.calls;
      if (result.ok) {
        summary.done += 1;
        summary.saved += result.saved;
        summary.linked += result.linked;
        summary.cancelled += result.cancelled;
      } else {
        summary.failed += 1;
        if (summary.failures.length < 10) summary.failures.push(`${task.sigunguCode} ${task.yearMonth} ${task.kind} ${result.code}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  summary.skipped = tasks.length - summary.done - summary.failed;

  // 끝의 다시 잇기(DB 만) — 시간이 남을 때만 하는 덤. 이번에 배운 aptSeq 까지 쓰도록 색인을 새로 읽는다.
  // 저장된 거래는 위에서 먼저 이었고(relinkFirst), 이번에 새로 모은 거래는 수집할 때 같은 규칙으로 이어졌다
  summary.relinked = 0;
  for (const sigunguCode of targets) {
    if (now() > deadline + REQUEST_TIMEOUT_MS) break;
    summary.relinked += await relinkSigungu(sigunguCode, await loadLinkIndex(sigunguCode));
  }

  // 다 채운 시군구의 대기 작업 끝내기
  const filled = await prisma.marketCollection.groupBy({
    by: ['sigunguCode'],
    where: { sigunguCode: { in: targets }, yearMonth: { in: months }, collectedAt: { not: null } },
    _count: { _all: true },
  });
  const complete = filled.filter((row) => row._count._all >= months.length * KINDS.length).map((row) => row.sigunguCode);
  summary.jobsCompleted = await completeBackfillJobs(complete, { startedAt: new Date(startedAt) });
  summary.elapsedMs = now() - startedAt;
  return summary;
};

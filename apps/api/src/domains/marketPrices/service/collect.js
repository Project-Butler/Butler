// 실거래가 수집(정기 실행 GET /api/cron/market-prices) — 시세 계획서 5절. 규칙 값은 marketPriceRules.js.
// 한 번 실행에서(우선순위 순): ① 처음 보는 묶음(한 번도 못 모은 달)의 12개월 채우기 ② 최근 3개월 다시 모으기.
// 묶음 = (시군구, 계약월, 매매/전월세). 묶음마다 그 행을 지우고 새로 넣는다(한 트랜잭션 — 해제된 거래가 빠지게).
// 시간이 모자라면 오래 안 시도한 묶음부터 하고 남은 것은 다음 번. 끝에 원천을 다시 부르지 않고 나중에 등록된 단지를 잇는다.

import { prisma } from '../../../platform/prismaClient.js';
import { listAllOwnedLegalDongCodes } from '../../community/platformBridge.js';
import { buildLinkIndex, dealLotKey, linkDeals, linkStoredKeys, roadKeyOf, usableKeys } from '../linkComplex.js';
import { CONCURRENCY, REFRESH_MIN_AGE_MS, REFRESH_MONTHS, REQUEST_TIMEOUT_MS, RUN_BUDGET_MS } from '../marketPriceRules.js';
import { retentionMonths } from '../months.js';
import { fetchRtmsMonth } from '../rtmsProvider.js';
import { completeBackfillJobs, listPendingBackfillSigunguCodes } from './backfillJobs.js';

const KINDS = ['TRADE', 'RENT'];
const clip = (text, length) => (text ? String(text).slice(0, length) : null);
const toBigInt = (won) => (won === null || won === undefined ? null : BigInt(won));

// 대상 시군구 — 커뮤니티를 읽을 수 있는 임대인(활성 소유, 인증 취소 아님)의 단지가 있는 곳 + 대기 작업이 걸린 곳
export const listTargetSigunguCodes = async () => {
  const legalDongCodes = await listAllOwnedLegalDongCodes();
  const pending = await listPendingBackfillSigunguCodes();
  return [...new Set([...legalDongCodes.map((code) => code.slice(0, 5)), ...pending])].sort();
};

// 할 일 고르기(순수 함수). collections: 그 시군구들 · 달들의 market_collections 행
// 반환: [{ sigunguCode, yearMonth, kind, reason: 'BACKFILL' | 'REFRESH' }] — 앞에서부터 한다
export const planCollectionTasks = ({ sigunguCodes, months, collections, now }) => {
  const byKey = new Map(collections.map((row) => [`${row.sigunguCode}|${row.yearMonth}|${row.dealKind}`, row]));
  const recent = new Set(months.slice(-REFRESH_MONTHS));
  const tasks = [];
  for (const sigunguCode of sigunguCodes) {
    for (const yearMonth of months) {
      for (const kind of KINDS) {
        const row = byKey.get(`${sigunguCode}|${yearMonth}|${kind}`);
        const attemptedAt = row?.attemptedAt ? new Date(row.attemptedAt).getTime() : 0;
        if (!row?.collectedAt) tasks.push({ sigunguCode, yearMonth, kind, reason: 'BACKFILL', priority: 0, attemptedAt });
        else if (recent.has(yearMonth) && now - new Date(row.collectedAt).getTime() >= REFRESH_MIN_AGE_MS) {
          tasks.push({ sigunguCode, yearMonth, kind, reason: 'REFRESH', priority: 1, attemptedAt });
        }
      }
    }
  }
  // 채우기 먼저, 그 안에서 오래 안 시도한 묶음(한 번도 안 한 것 = 0)부터, 같으면 시군구 · 최근 달 · 매매 먼저
  tasks.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.attemptedAt - b.attemptedAt ||
      a.sigunguCode.localeCompare(b.sigunguCode) ||
      b.yearMonth.localeCompare(a.yearMonth) ||
      KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind),
  );
  return tasks.map(({ priority, attemptedAt, ...task }) => task);
};

// 시군구 하나의 잇기 색인 — 그 시군구 단지 · 법정동 · 앞서 도로명 · 지번으로 이어진 거래의 aptSeq
export const loadLinkIndex = async (sigunguCode) => {
  const [complexes, regions, hints] = await Promise.all([
    prisma.complex.findMany({
      where: { regionId: { startsWith: sigunguCode } },
      select: { id: true, sourceKey: true, regionId: true, isMountain: true, mainLot: true, subLot: true, roadCode: true, isUnderground: true, buildingMainNo: true, buildingSubNo: true },
    }),
    prisma.region.findMany({ where: { id: { startsWith: sigunguCode } }, select: { id: true, dongName: true } }),
    prisma.marketDeal.findMany({
      where: { sigunguCode, complexId: { not: null }, aptSeq: { not: null }, linkMethod: { in: ['ROAD', 'JIBUN'] } },
      select: { aptSeq: true, complexId: true },
      distinct: ['aptSeq', 'complexId'],
    }),
  ]);
  return buildLinkIndex({ complexes, regions, aptSeqHints: hints.map((row) => [row.aptSeq, row.complexId]) });
};

// 묶음 하나: 받기 → 해제 빼기 → 잇기 → 지우고 넣기(한 트랜잭션). 받기에 실패하면 묶음은 그대로 두고 실패만 적는다
const collectOne = async (task, { fetchImpl, getIndex, nowDate }) => {
  const { sigunguCode, yearMonth, kind } = task;
  const where = { sigunguCode_yearMonth_dealKind: { sigunguCode, yearMonth, dealKind: kind } };
  try {
    const { deals, calls } = await fetchRtmsMonth({ kind, sigunguCode, yearMonth }, { fetchImpl });
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
    const code = String(error?.code ?? error?.name ?? 'ERROR').slice(0, 30);
    await prisma.marketCollection.upsert({
      where,
      create: { sigunguCode, yearMonth, dealKind: kind, status: 'FAILED', attemptedAt, lastErrorCode: code },
      update: { status: 'FAILED', attemptedAt, lastErrorCode: code },
    });
    return { ok: false, calls: error?.calls ?? 1, code };
  }
};

// 원천을 다시 부르지 않고 잇기 — 아직 못 이은 거래 중 지금 등록된 단지의 키와 맞는 것만 DB 에서 골라 잇는다(나중에 등록된 단지도 12개월이 보이게)
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
  const select = { id: true, roadKey: true, lotKey: true, aptSeq: true };
  if (roadKeys.length || lotKeys.length) {
    await apply(
      await prisma.marketDeal.findMany({ where: { sigunguCode, complexId: null, OR: [{ roadKey: { in: roadKeys } }, { lotKey: { in: lotKeys } }] }, select }),
    );
  }
  const { aptSeqs } = usableKeys(index);
  if (aptSeqs.length) await apply(await prisma.marketDeal.findMany({ where: { sigunguCode, complexId: null, aptSeq: { in: aptSeqs } }, select }));
  return relinked;
};

// 정기 실행 한 번. sigunguCodes 를 주면 그곳만(로컬 확인용), budgetMs 로 시간 한도를 바꾼다(테스트).
export const collectMarketPrices = async ({ fetchImpl, now = Date.now, budgetMs = RUN_BUDGET_MS, sigunguCodes } = {}) => {
  const startedAt = now();
  const deadline = startedAt + budgetMs;
  const nowDate = () => new Date(now());
  const targets = sigunguCodes ?? (await listTargetSigunguCodes());
  const months = retentionMonths(new Date(startedAt));
  const collections = await prisma.marketCollection.findMany({ where: { sigunguCode: { in: targets }, yearMonth: { in: months } } });
  const tasks = planCollectionTasks({ sigunguCodes: targets, months, collections, now: startedAt });

  const indexes = new Map();
  const getIndex = (sigunguCode) => {
    if (!indexes.has(sigunguCode)) indexes.set(sigunguCode, loadLinkIndex(sigunguCode));
    return indexes.get(sigunguCode);
  };
  const summary = { targets: targets.length, planned: tasks.length, backfill: tasks.filter((t) => t.reason === 'BACKFILL').length, done: 0, failed: 0, skipped: 0, calls: 0, saved: 0, linked: 0, cancelled: 0, failures: [] };

  let next = 0;
  const worker = async () => {
    // 요청 하나 + 저장 몫이 남아 있을 때만 새 묶음을 시작한다
    while (next < tasks.length && now() + REQUEST_TIMEOUT_MS <= deadline) {
      const task = tasks[next];
      next += 1;
      const result = await collectOne(task, { fetchImpl, getIndex, nowDate });
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

  // 잇기 다시(DB 만) — 이번에 배운 aptSeq 까지 쓰도록 색인을 새로 읽는다
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

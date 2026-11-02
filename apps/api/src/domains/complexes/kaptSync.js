// K-apt 전국 단지 목록 → kapt_complexes 동기화. 매주 Vercel Cron(domains/cron)과
// `npm run sync:kapt`(prisma/syncKaptComplexes.js)가 부른다.
//
// 적용 방식은 prisma/seed.js(법정동)와 같다: 새 단지는 묶어서 넣고, 바뀐 행만 고치고,
// 목록에서 빠진 단지는 지우지 않고 isActive=false로만 바꾼다.
// 받아 온 건수가 비정상적으로 적으면(API 장애·부분 응답) 아무것도 비활성으로 바꾸지 않고 멈춘다.
//
// 실행 결과는 jobs 테이블에 KAPT_COMPLEX_SYNC로 남긴다. result·error에 URL·키는 넣지 않는다.
import { Prisma } from '@prisma/client';
import { ExternalServiceError } from './provider/ExternalServiceError.js';
import { fetchJson, readDataGoKrBody, toItemArray } from './provider/publicApi.js';

const KAPT_TOTAL_LIST_URL = 'https://apis.data.go.kr/1613000/AptListService4/getTotalAptList4';
// 1000건이면 한 페이지 0.7초 정도다. 더 크게 잡으면 한 번에 8초 가까이 걸려 타임아웃에 걸린다.
const PAGE_SIZE = 1000;
// 2026-10 기준 전국 22,338건. 페이지 수가 이보다 많으면 응답이 잘못된 것으로 본다.
const MAX_PAGES = 50;
const BATCH_SIZE = 1000;
// 변경 행 일괄 UPDATE는 행마다 파라미터 6개를 쓴다. 500행이면 3,000개라 PostgreSQL 한도(65,535) 안이다.
const UPDATE_BATCH_SIZE = 500;

// 전국 목록이 이보다 적거나, 지금 활성 단지의 80%에 못 미치면 비정상 응답으로 보고 멈춘다.
export const MIN_EXPECTED_ROWS = 15000;
export const MIN_ACTIVE_RATIO = 0.8;

// 한 번에 비활성으로 바꿀 수 있는 단지 수. 넘으면 응답 이상으로 보고 아무것도 쓰지 않고 멈춘다.
export const MAX_DEACTIVATIONS = 2000;

export const KAPT_SYNC_JOB_TYPE = 'KAPT_COMPLEX_SYNC';
// 겹침 방지: PROCESSING이면서 lockedAt이 이 시간 안이면 이미 실행 중으로 본다. 더 오래되면 죽은 작업(stale).
export const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

const LEGAL_DONG_CODE_PATTERN = /^\d{10}$/;
const KAPT_CODE_MAX_LENGTH = 20;
const COMPARED_FIELDS = ['name', 'legalDongCode', 'sidoName', 'sigunguName', 'dongName', 'riName'];

// 동기화를 멈춰야 하는 데이터 문제. 외부 장애(ExternalServiceError)와 구분해서 jobs에 남긴다.
export class KaptSyncAbortError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'KaptSyncAbortError';
    this.reason = reason;
  }
}

const trimOrNull = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
};

// K-apt 목록 행 → kapt_complexes 행. 코드·이름·법정동 코드가 없거나 형식이 틀리면 null(건너뜀).
export const toKaptComplexRow = (item) => {
  const kaptCode = trimOrNull(item?.kaptCode);
  const name = trimOrNull(item?.kaptName);
  const legalDongCode = trimOrNull(String(item?.bjdCode ?? ''));
  if (!kaptCode || kaptCode.length > KAPT_CODE_MAX_LENGTH || !name) return null;
  if (!legalDongCode || !LEGAL_DONG_CODE_PATTERN.test(legalDongCode)) return null;

  return {
    kaptCode,
    name,
    legalDongCode,
    sidoName: trimOrNull(item.as1),
    sigunguName: trimOrNull(item.as2),
    dongName: trimOrNull(item.as3),
    riName: trimOrNull(item.as4),
  };
};

// 받아 온 원본 목록을 행으로 바꾼다. 같은 kaptCode가 두 번 오면(페이지 경계에서 목록이 바뀐 경우) 뒤 행을 쓴다.
export const toKaptComplexRows = (items) => {
  const byCode = new Map();
  let skipped = 0;
  for (const item of items) {
    const row = toKaptComplexRow(item);
    if (row) byCode.set(row.kaptCode, row);
    else skipped += 1;
  }
  return { rows: [...byCode.values()], skipped };
};

export const assertFetchedEnough = ({ fetchedCount, activeCount }) => {
  if (fetchedCount < MIN_EXPECTED_ROWS) {
    throw new KaptSyncAbortError(`fetched ${fetchedCount} < ${MIN_EXPECTED_ROWS}`);
  }
  if (fetchedCount < activeCount * MIN_ACTIVE_RATIO) {
    throw new KaptSyncAbortError(`fetched ${fetchedCount} < ${MIN_ACTIVE_RATIO * 100}% of active ${activeCount}`);
  }
};

export const assertDeactivationWithinLimit = (deactivateCount) => {
  if (deactivateCount > MAX_DEACTIVATIONS) {
    throw new KaptSyncAbortError(`deactivate ${deactivateCount} > ${MAX_DEACTIVATIONS}`);
  }
};

export const isKaptComplexChanged = (existing, row) =>
  !existing.isActive || COMPARED_FIELDS.some((field) => existing[field] !== row[field]);

// 전국 목록을 페이지 순서대로 받는다. 동시에 부르지 않는다(data.go.kr 쿼터·부하).
const fetchAllKaptItems = async () => {
  const items = [];
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
    const json = await fetchJson('kapt-total-list', KAPT_TOTAL_LIST_URL, {
      serviceKey: process.env.DATA_GO_KR_SERVICE_KEY,
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
    });
    const body = readDataGoKrBody('kapt-total-list', json);
    const pageItems = toItemArray(body?.items);
    items.push(...pageItems);

    const totalCount = Number(body?.totalCount) || 0;
    if (pageItems.length === 0 || items.length >= totalCount) return items;
  }
  throw new ExternalServiceError('kapt-total-list too many pages');
};

const chunk = (list, size) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
};

const applyKaptComplexRows = async (prisma, rows, now) => {
  const existingRows = await prisma.kaptComplex.findMany({
    select: { kaptCode: true, isActive: true, ...Object.fromEntries(COMPARED_FIELDS.map((field) => [field, true])) },
  });
  const activeCount = existingRows.filter((existing) => existing.isActive).length;
  assertFetchedEnough({ fetchedCount: rows.length, activeCount });

  const existingByCode = new Map(existingRows.map((existing) => [existing.kaptCode, existing]));
  const fetchedCodes = new Set(rows.map((row) => row.kaptCode));

  // 비활성 대상은 쓰기 전에 정해서 상한을 넘으면 아무것도 쓰지 않고 멈춘다.
  const removedCodes = existingRows
    .filter((existing) => existing.isActive && !fetchedCodes.has(existing.kaptCode))
    .map((existing) => existing.kaptCode);
  assertDeactivationWithinLimit(removedCodes.length);

  // 2만 건 넘게 행마다 upsert하면 느려서, 새 단지는 묶어서 넣고 바뀐 행만 고친다.
  const newRows = rows.filter((row) => !existingByCode.has(row.kaptCode));
  let inserted = 0;
  for (const batch of chunk(newRows, BATCH_SIZE)) {
    const { count } = await prisma.kaptComplex.createMany({
      data: batch.map((row) => ({ ...row, isActive: true, syncedAt: now })),
      skipDuplicates: true,
    });
    inserted += count;
  }

  // Vercel 함수가 DB와 먼 리전에서 돌 수 있어 왕복을 줄인다: 바뀐 행은 500개씩 UPDATE ... FROM (VALUES ...) 한 번으로 고친다.
  // 값은 전부 파라미터로 넘긴다(문자열 이어붙이기 없음). NULL이 들어가는 열은 ::text로 타입을 정해 준다.
  const changedRows = rows.filter((row) => {
    const existing = existingByCode.get(row.kaptCode);
    return existing && isKaptComplexChanged(existing, row);
  });
  for (const batch of chunk(changedRows, UPDATE_BATCH_SIZE)) {
    const values = Prisma.join(
      batch.map(
        (row) =>
          Prisma.sql`(${row.kaptCode}::text, ${row.name}::text, ${row.legalDongCode}::text, ${row.sidoName}::text, ${row.sigunguName}::text, ${row.dongName}::text, ${row.riName}::text)`,
      ),
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "kapt_complexes" AS k SET
        "name" = v.name,
        "legal_dong_code" = v.legal_dong_code,
        "sido_name" = v.sido_name,
        "sigungu_name" = v.sigungu_name,
        "dong_name" = v.dong_name,
        "ri_name" = v.ri_name,
        "is_active" = true,
        "synced_at" = ${now},
        "updated_at" = ${now}
      FROM (VALUES ${values}) AS v(kapt_code, name, legal_dong_code, sido_name, sigungu_name, dong_name, ri_name)
      WHERE k."kapt_code" = v.kapt_code
    `);
  }

  for (const batch of chunk(removedCodes, BATCH_SIZE)) {
    await prisma.kaptComplex.updateMany({ where: { kaptCode: { in: batch } }, data: { isActive: false } });
  }

  // 이번 목록에 있던(= 지금 활성인) 단지의 syncedAt만 올린다. updatedAt은 내용이 바뀐 행만 바뀌도록 SQL로 직접 쓴다.
  await prisma.$executeRaw`UPDATE "kapt_complexes" SET "synced_at" = ${now} WHERE "is_active" = true`;

  return { inserted, updated: changedRows.length, deactivated: removedCodes.length };
};

// jobs.error에 남길 짧은 사유. 원본 에러 메시지(URL·DB 접속 정보가 섞일 수 있음)는 넣지 않는다.
const toFailureReason = (error) => {
  if (error instanceof KaptSyncAbortError || error instanceof ExternalServiceError) return error.reason;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (error instanceof TypeError && error.message === 'fetch failed') return 'network error';
  return 'internal error';
};

// 이미 도는 동기화가 있으면 건너뛰고, 10분 넘게 PROCESSING인 작업은 죽은 것으로 보고 FAILED로 정리한다.
// 확인과 job 생성 사이에 틈이 있어 정확히 동시에 시작하면 둘 다 돌 수 있다(주 1회 cron이라 감수). 결과는 멱등이다.
const acquireSyncLock = async (prisma, now) => {
  const processing = await prisma.job.findMany({
    where: { type: KAPT_SYNC_JOB_TYPE, status: 'PROCESSING' },
    select: { id: true, lockedAt: true },
  });
  const staleBefore = now.getTime() - LOCK_TIMEOUT_MS;
  const isStale = (job) => !job.lockedAt || job.lockedAt.getTime() < staleBefore;

  if (processing.some((job) => !isStale(job))) return false;

  const staleIds = processing.filter(isStale).map((job) => job.id);
  if (staleIds.length > 0) {
    await prisma.job.updateMany({
      where: { id: { in: staleIds }, status: 'PROCESSING' },
      data: { status: 'FAILED', error: { reason: 'stale' }, lockedAt: null },
    });
  }
  return true;
};

export const syncKaptComplexes = async ({ prisma, now = new Date() }) => {
  const startedAt = Date.now();
  if (!(await acquireSyncLock(prisma, now))) return { skipped: true, reason: 'already-running' };

  const job = await prisma.job.create({
    data: { type: KAPT_SYNC_JOB_TYPE, status: 'PROCESSING', attempts: 1, lockedAt: now },
    select: { id: true },
  });

  try {
    if (!process.env.DATA_GO_KR_SERVICE_KEY) throw new ExternalServiceError('DATA_GO_KR_SERVICE_KEY missing');

    const { rows, skipped } = toKaptComplexRows(await fetchAllKaptItems());
    const applied = await applyKaptComplexRows(prisma, rows, now);
    const summary = { fetched: rows.length, skipped, ...applied, durationMs: Date.now() - startedAt };

    await prisma.job.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', result: summary, lockedAt: null } });
    return summary;
  } catch (error) {
    const reason = toFailureReason(error);
    console.error('[kapt-sync] 실패', reason);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: { reason, durationMs: Date.now() - startedAt }, lockedAt: null },
    });
    throw error;
  }
};

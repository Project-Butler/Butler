// data_imports(참고 데이터 가져오기 실행 기록)와 잠금.
// 실행 단위 잠금 = RUNNING 행(lock_key 부분 유니크라 같은 표에 쓰는 실행은 동시에 하나만 RUNNING).
// 쓰기 트랜잭션 안에서는 pg_try_advisory_xact_lock을 한 번 더 잡는다(트랜잭션이 끝나면 풀려서 pgbouncer 트랜잭션 모드에서도 됨).
import { Prisma } from '@prisma/client';

export const SOURCES = {
  KAPT_EXCEL: 'KAPT_EXCEL',
  JUSO_FULL: 'JUSO_FULL',
  JUSO_DELTA: 'JUSO_DELTA',
};

// lock_key: 쓰는 표 기준. juso 전체분·변동분은 같은 키.
export const LOCK_KEYS = {
  JUSO: 'juso_building_links',
  KAPT_EXCEL: 'kapt_address_links:KAPT_EXCEL',
};

// RUNNING이 이보다 오래되면 죽은 실행(stale)으로 본다.
export const STALE_RUNNING_MS = 2 * 60 * 60 * 1000;

export class ImportAlreadyRunningError extends Error {
  constructor(lockKey) {
    super(`already running: ${lockKey}`);
    this.name = 'ImportAlreadyRunningError';
    this.reason = 'already running';
    this.lockKey = lockKey;
  }
}

// 게이트·형식 문제로 멈춘 실행. reason은 그대로 data_imports.error에 남는다.
export class ImportGateError extends Error {
  constructor(reason, stats = null) {
    super(reason);
    this.name = 'ImportGateError';
    this.reason = reason;
    this.stats = stats;
  }
}

const isUniqueViolation = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

// raw SQL에서 난 유니크 위반(23505)
const isRawUniqueViolation = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010' && /23505/.test(error.message);

// 'YYYY-MM-DD' → @db.Date에 넣을 Date(UTC 자정)
export const toDateValue = (ymd) => (ymd ? new Date(`${ymd}T00:00:00.000Z`) : null);

// 오래된 RUNNING 정리. JUSO_DELTA는 커서가 의미 있으므로 PARTIAL로(같은 파일이면 이어서), 그 밖은 FAILED.
export const releaseStaleRunning = async (prisma, lockKey, now = new Date()) => {
  const before = new Date(now.getTime() - STALE_RUNNING_MS);
  const stale = await prisma.dataImport.findMany({
    where: { lockKey, status: 'RUNNING', startedAt: { lt: before } },
    select: { id: true, source: true },
  });
  for (const row of stale) {
    await prisma.dataImport.update({
      where: { id: row.id },
      data:
        row.source === SOURCES.JUSO_DELTA
          ? { status: 'PARTIAL', error: 'stale' }
          : { status: 'FAILED', error: 'stale', finishedAt: now },
    });
  }
  return stale.length;
};

// RUNNING 행을 넣는다. 같은 lock_key의 RUNNING이 있으면 ImportAlreadyRunningError.
export const startImport = async (prisma, data) => {
  try {
    return await prisma.dataImport.create({ data: { ...data, status: 'RUNNING' } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ImportAlreadyRunningError(data.lockKey);
    throw error;
  }
};

// PARTIAL 행을 다시 RUNNING으로(이어서 하기). 다른 RUNNING이 있으면 ImportAlreadyRunningError.
export const resumeImport = async (prisma, id, data) => {
  try {
    const { count } = await prisma.dataImport.updateMany({
      where: { id, status: 'PARTIAL' },
      data: { ...data, status: 'RUNNING', error: null },
    });
    if (count === 0) throw new ImportAlreadyRunningError('partial row taken');
    return prisma.dataImport.findUnique({ where: { id } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ImportAlreadyRunningError('juso_building_links');
    throw error;
  }
};

export const finishImport = (prisma, id, { status, error = null, ...data }) =>
  prisma.dataImport.update({
    where: { id },
    data: {
      ...data,
      status,
      error: error ? String(error).slice(0, 500) : null,
      ...(status === 'PARTIAL' ? {} : { finishedAt: new Date() }),
    },
  });

// 트랜잭션 안에서만 쓰는 잠금. 못 잡으면 ImportAlreadyRunningError.
export const takeXactLock = async (tx, name) => {
  const [{ locked }] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${`refdata:${name}`})) AS locked`;
  if (!locked) throw new ImportAlreadyRunningError(name);
};

// 같은 소스의 지난 성공(게이트의 "지난 성공 대비" 비교용)
export const findLastSucceeded = (prisma, source) =>
  prisma.dataImport.findFirst({
    where: { source, status: 'SUCCEEDED' },
    orderBy: { finishedAt: 'desc' },
  });

// 변동분 커서: 마지막 JUSO_DELTA SUCCEEDED의 file_date('YYYY-MM-DD') 또는 null
export const findDeltaCursorDate = async (prisma) => {
  const row = await prisma.dataImport.findFirst({
    where: { source: SOURCES.JUSO_DELTA, status: 'SUCCEEDED', fileDate: { not: null } },
    orderBy: { fileDate: 'desc' },
    select: { fileDate: true },
  });
  return row ? row.fileDate.toISOString().slice(0, 10) : null;
};

// 전체분 성공 뒤: 변동분 커서를 전체분 기준일로 옮긴다. 기준일보다 뒤의 변동분 성공 기록은 전체분이 덮었으므로
// FAILED('superseded by full load')로 바꿔 다음 실행이 그 날짜부터 다시 적용하게 한다.
export const moveDeltaCursorToBaseline = async (prisma, baselineDate, stats) => {
  const fileDate = toDateValue(baselineDate);
  const superseded = await prisma.dataImport.updateMany({
    where: { source: SOURCES.JUSO_DELTA, status: 'SUCCEEDED', fileDate: { gt: fileDate } },
    data: { status: 'FAILED', error: `superseded by full load ${baselineDate}` },
  });
  const existing = await prisma.dataImport.findFirst({
    where: { source: SOURCES.JUSO_DELTA, status: 'SUCCEEDED', fileDate },
    select: { id: true },
  });
  if (!existing) {
    try {
      await prisma.dataImport.create({
        data: {
          source: SOURCES.JUSO_DELTA,
          lockKey: LOCK_KEYS.JUSO,
          fileDate,
          status: 'SUCCEEDED',
          stats: { reason: 'full load baseline', ...stats },
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error) && !isRawUniqueViolation(error)) throw error;
    }
  }
  return { superseded: superseded.count };
};

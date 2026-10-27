// reference_data_imports(참고 데이터 가져오기 실행 기록)와 잠금.
// 실행 단위 잠금 = RUNNING 행(lock_key 부분 유니크라 같은 표에 쓰는 실행은 동시에 하나만 RUNNING).
// 쓰기 트랜잭션 안에서는 pg_try_advisory_xact_lock을 한 번 더 잡는다(트랜잭션이 끝나면 풀려서 pgbouncer 트랜잭션 모드에서도 됨).
import { Prisma } from '@prisma/client';

// JUSO_DELTA: 건물DB 일변동분(비공개 받기 주소, 날짜 = stdde)
// JUSO_LINK: 변동자료 공식 연계(승인키, 날짜 = 연계 기준일 = stdde + 1)
// JUSO_LINK_SHADOW: 공식 연계를 계획만 하고 JUSO_DELTA 결과와 비교한 기록(쓰기 없음)
export const SOURCES = {
  KAPT_EXCEL: 'KAPT_EXCEL',
  JUSO_FULL: 'JUSO_FULL',
  JUSO_DELTA: 'JUSO_DELTA',
  JUSO_LINK: 'JUSO_LINK',
  JUSO_LINK_SHADOW: 'JUSO_LINK_SHADOW',
};

// 날짜 커서가 있는 juso 변동 출처(실제로 표에 쓰는 것)
export const JUSO_CURSOR_SOURCES = [SOURCES.JUSO_DELTA, SOURCES.JUSO_LINK];

// lock_key: 쓰는 표 기준. juso 전체분·변동분·공식 연계는 같은 키. shadow는 쓰지 않으므로 따로(잠금 다툼 없음).
export const LOCK_KEYS = {
  JUSO: 'juso_building_links',
  JUSO_SHADOW: 'juso_building_links:shadow',
  KAPT_EXCEL: 'kapt_address_links:KAPT_EXCEL',
};

// 'YYYY-MM-DD' ± days
export const addDays = (ymd, days) => {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// 같은 변동을 담은 두 날짜: 공식 연계 기준일 L의 파일 = 비공개 받기 stdde L-1의 파일(안의 파일 이름 날짜가 L).
export const toLinkDate = (deltaDate) => addDays(deltaDate, 1);
export const toDeltaDate = (linkDate) => addDays(linkDate, -1);

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

// 게이트·형식 문제로 멈춘 실행. reason은 그대로 reference_data_imports.error에 남는다.
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

// 오래된 RUNNING 정리. JUSO_DELTA·JUSO_LINK는 커서가 의미 있으므로 PARTIAL로(같은 파일이면 이어서), 그 밖은 FAILED.
export const releaseStaleRunning = async (prisma, lockKey, now = new Date()) => {
  const before = new Date(now.getTime() - STALE_RUNNING_MS);
  const stale = await prisma.referenceDataImport.findMany({
    where: { lockKey, status: 'RUNNING', startedAt: { lt: before } },
    select: { id: true, source: true },
  });
  for (const row of stale) {
    await prisma.referenceDataImport.update({
      where: { id: row.id },
      data:
        JUSO_CURSOR_SOURCES.includes(row.source)
          ? { status: 'PARTIAL', error: 'stale' }
          : { status: 'FAILED', error: 'stale', finishedAt: now },
    });
  }
  return stale.length;
};

// RUNNING 행을 넣는다. 같은 lock_key의 RUNNING이 있으면 ImportAlreadyRunningError.
export const startImport = async (prisma, data) => {
  try {
    return await prisma.referenceDataImport.create({ data: { ...data, status: 'RUNNING' } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ImportAlreadyRunningError(data.lockKey);
    throw error;
  }
};

// PARTIAL 행을 다시 RUNNING으로(이어서 하기). 다른 RUNNING이 있으면 ImportAlreadyRunningError.
export const resumeImport = async (prisma, id, data) => {
  try {
    const { count } = await prisma.referenceDataImport.updateMany({
      where: { id, status: 'PARTIAL' },
      data: { ...data, status: 'RUNNING', error: null },
    });
    if (count === 0) throw new ImportAlreadyRunningError('partial row taken');
    return prisma.referenceDataImport.findUnique({ where: { id } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ImportAlreadyRunningError('juso_building_links');
    throw error;
  }
};

export const finishImport = (prisma, id, { status, error = null, ...data }) =>
  prisma.referenceDataImport.update({
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
  prisma.referenceDataImport.findFirst({
    where: { source, status: 'SUCCEEDED' },
    orderBy: { finishedAt: 'desc' },
  });

// 변동 커서: 그 출처의 마지막 SUCCEEDED file_date('YYYY-MM-DD') 또는 null
export const findDeltaCursorDate = async (prisma, source = SOURCES.JUSO_DELTA) => {
  const row = await prisma.referenceDataImport.findFirst({
    where: { source, status: 'SUCCEEDED', fileDate: { not: null } },
    orderBy: { fileDate: 'desc' },
    select: { fileDate: true },
  });
  return row ? row.fileDate.toISOString().slice(0, 10) : null;
};

// 출처의 커서를 date로 옮긴다: date보다 뒤의 SUCCEEDED는 FAILED(reason)로 바꾸고, date의 SUCCEEDED 기준점 행이 없으면 만든다.
export const setCursorBaseline = async (prisma, source, date, { reason, stats = {} } = {}) => {
  const fileDate = toDateValue(date);
  const superseded = await prisma.referenceDataImport.updateMany({
    where: { source, status: 'SUCCEEDED', fileDate: { gt: fileDate } },
    data: { status: 'FAILED', error: reason },
  });
  const existing = await prisma.referenceDataImport.findFirst({
    where: { source, status: 'SUCCEEDED', fileDate },
    select: { id: true },
  });
  if (!existing) {
    try {
      await prisma.referenceDataImport.create({
        data: {
          source,
          lockKey: LOCK_KEYS.JUSO,
          fileDate,
          status: 'SUCCEEDED',
          stats: { reason: 'baseline', ...stats },
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error) && !isRawUniqueViolation(error)) throw error;
    }
  }
  return { superseded: superseded.count };
};

// 전체분 성공 뒤: 변동 커서를 전체분 기준일로 옮긴다. 기준일보다 뒤의 성공 기록은 전체분이 덮었으므로
// FAILED('superseded by full load')로 바꿔 다음 실행이 그 날짜부터 다시 적용하게 한다.
// 공식 연계(JUSO_LINK)는 모드(env)가 아니라 DB 상태로 정한다: 성공 기록이 하나라도 있으면(전환된 적 있음) 그 커서도
// 같은 날짜(연계 기준일 = 기준일 + 1)로 옮긴다. 로컬 .env와 배포 환경 모드가 달라도 두 커서가 어긋나지 않게.
export const moveDeltaCursorToBaseline = async (prisma, baselineDate, stats) => {
  const reason = `superseded by full load ${baselineDate}`;
  const delta = await setCursorBaseline(prisma, SOURCES.JUSO_DELTA, baselineDate, { reason, stats: { reason: 'full load baseline', ...stats } });
  const linkUsed = await prisma.referenceDataImport.findFirst({
    where: { source: SOURCES.JUSO_LINK, status: 'SUCCEEDED' },
    select: { id: true },
  });
  if (!linkUsed) return { superseded: delta.superseded };
  const link = await setCursorBaseline(prisma, SOURCES.JUSO_LINK, toLinkDate(baselineDate), {
    reason,
    stats: { reason: 'full load baseline', ...stats },
  });
  return { superseded: delta.superseded, linkSuperseded: link.superseded };
};

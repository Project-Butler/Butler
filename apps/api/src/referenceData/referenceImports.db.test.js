// 출처별 커서·기준점·stale 정리(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
// 2099년 날짜만 쓰고 끝에 지운다.
import { dbTestSkip } from '../testSupport/dbTest.js';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { prisma } from '../platform/prismaClient.js';
import {
  findDeltaCursorDate,
  LOCK_KEYS,
  moveDeltaCursorToBaseline,
  releaseStaleRunning,
  setCursorBaseline,
  SOURCES,
  STALE_RUNNING_MS,
  toLinkDate,
} from './referenceImports.js';

const day = (ymd) => new Date(`${ymd}T00:00:00Z`);
const future = { fileDate: { gte: day('2099-01-01') } };
const succeededDates = async (source) =>
  (await prisma.dataImport.findMany({ where: { source, status: 'SUCCEEDED', ...future }, orderBy: { fileDate: 'asc' } })).map(
    (row) => row.fileDate.toISOString().slice(0, 10),
  );

describe('출처별 커서·기준점', { skip: dbTestSkip }, () => {
  after(async () => {
    await prisma.dataImport.deleteMany({ where: future });
  });

  test('공식 연계 날짜 = 건물DB 기준일 + 1', () => {
    assert.equal(toLinkDate('2099-02-28'), '2099-03-01');
  });

  test('JUSO_LINK는 날짜마다 성공 1번(부분 유니크)', async () => {
    const data = { source: SOURCES.JUSO_LINK, lockKey: LOCK_KEYS.JUSO, fileDate: day('2099-01-10'), status: 'SUCCEEDED' };
    await prisma.dataImport.create({ data });
    await assert.rejects(prisma.dataImport.create({ data }), { code: 'P2002' });
    assert.equal(await findDeltaCursorDate(prisma, SOURCES.JUSO_LINK), '2099-01-10');
    await prisma.dataImport.deleteMany({ where: future });
  });

  test('오래된 RUNNING: JUSO_LINK는 PARTIAL(이어 하기), 그 밖은 FAILED', async () => {
    const startedAt = new Date(Date.now() - STALE_RUNNING_MS - 60_000);
    const make = (source, lockKey, ymd) =>
      prisma.dataImport.create({ data: { source, lockKey, fileDate: day(ymd), status: 'RUNNING', startedAt } });
    const link = await make(SOURCES.JUSO_LINK, LOCK_KEYS.JUSO, '2099-01-11');
    assert.equal(await releaseStaleRunning(prisma, LOCK_KEYS.JUSO), 1);
    assert.equal((await prisma.dataImport.findUnique({ where: { id: link.id } })).status, 'PARTIAL');
    const full = await make(SOURCES.JUSO_FULL, LOCK_KEYS.JUSO, '2099-01-12');
    await releaseStaleRunning(prisma, LOCK_KEYS.JUSO);
    assert.equal((await prisma.dataImport.findUnique({ where: { id: full.id } })).status, 'FAILED');
    await prisma.dataImport.deleteMany({ where: future });
  });

  test('전체분 기준점: 연계 커서를 기준일 + 1로, 뒤 기록은 superseded', async () => {
    await setCursorBaseline(prisma, SOURCES.JUSO_LINK, '2099-03-10', { reason: 'test' });
    await setCursorBaseline(prisma, SOURCES.JUSO_LINK, '2099-03-12', { reason: 'test' });
    const result = await moveDeltaCursorToBaseline(prisma, '2099-03-01', { test: true });
    assert.equal(result.superseded, 2);
    assert.deepEqual(await succeededDates(SOURCES.JUSO_LINK), ['2099-03-02']);
    const superseded = await prisma.dataImport.findFirst({ where: { source: SOURCES.JUSO_LINK, fileDate: day('2099-03-10') } });
    assert.equal(superseded.status, 'FAILED');
    assert.match(superseded.error, /superseded by full load 2099-03-01/);
    // 같은 기준점을 다시 옮겨도 행이 늘지 않는다
    await moveDeltaCursorToBaseline(prisma, '2099-03-01', { test: true });
    assert.deepEqual(await succeededDates(SOURCES.JUSO_LINK), ['2099-03-02']);
    await prisma.dataImport.deleteMany({ where: future });
  });
});

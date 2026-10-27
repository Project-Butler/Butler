// 공식 연계 전환·되돌리기와 shadow 비교(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
// 2099년 날짜만 쓰고 끝에 지운다. shadow는 실제 파일(일변동분 샘플·2026-10-26 공식 연계 응답)을 쓴다.
import { dbTestSkip } from '../testSupport/dbTest.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, test } from 'node:test';
import { prisma } from '../platform/prismaClient.js';
import { runShadowPhase } from '../domains/cron/referenceData.js';
import { cutoverToJusoLink, revertToJusoDelta } from './jusoLinkCutover.js';
import { groupLinkFilesByDate, parseLinkResponse } from './jusoLinkResponse.js';
import { findDeltaCursorDate, LOCK_KEYS, SOURCES } from './referenceImports.js';

const day = (ymd) => new Date(`${ymd}T00:00:00Z`);
const future = { fileDate: { gte: day('2099-01-01') } };
const succeeded = (source, ymd) =>
  prisma.referenceDataImport.create({ data: { source, lockKey: LOCK_KEYS.JUSO, fileDate: day(ymd), status: 'SUCCEEDED' } });

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

// 실제 응답 3종을 원하는 연계 기준일 날짜로 묶는다(내용은 2026-10-26 것).
const linkDaysOn = (linkDate) => async () =>
  groupLinkFilesByDate(
    Object.fromEntries(
      ['100001', '100004', '100005'].map((code) => [
        code,
        parseLinkResponse(fixture(`juso-link-${code}-20261026.bin`)).map((file) => ({ ...file, fileDate: linkDate })),
      ]),
    ),
  );

const tableFingerprint = async () => {
  const [row] = await prisma.$queryRaw`
    SELECT (SELECT count(*)::int FROM juso_building_links) AS links,
           (SELECT md5(string_agg(building_mgt_no || kapt_code || road_name_key, ',' ORDER BY building_mgt_no)) FROM juso_building_links) AS hash,
           (SELECT md5(string_agg(coalesce(road_name_key, '') || coalesce(kapt_code, ''), ',' ORDER BY id)) FROM complexes) AS complexes`;
  return row;
};

describe('공식 연계 전환·shadow', { skip: dbTestSkip }, () => {
  after(async () => {
    await prisma.referenceDataImport.deleteMany({ where: future });
  });

  test('전환: 일변동분 커서 X → 공식 연계 기준점 X+1(다음 적용 X+2), 일변동분 PARTIAL이 있으면 거부', async () => {
    await succeeded(SOURCES.JUSO_DELTA, '2099-07-01');
    const partial = await prisma.referenceDataImport.create({
      data: { source: SOURCES.JUSO_DELTA, lockKey: LOCK_KEYS.JUSO, fileDate: day('2099-07-02'), status: 'PARTIAL' },
    });
    await assert.rejects(cutoverToJusoLink(prisma), /juso delta PARTIAL \(2099-07-02\)/);
    await prisma.referenceDataImport.update({ where: { id: partial.id }, data: { status: 'FAILED' } });
    // 손으로 돌린 공식 연계가 PARTIAL로 남아 있어도 거부(기준점보다 옛 날짜를 이어 쓰지 않게)
    const linkPartial = await prisma.referenceDataImport.create({
      data: { source: SOURCES.JUSO_LINK, lockKey: LOCK_KEYS.JUSO, fileDate: day('2099-06-20'), status: 'PARTIAL' },
    });
    await assert.rejects(cutoverToJusoLink(prisma), /juso link PARTIAL \(2099-06-20\)/);
    await prisma.referenceDataImport.update({ where: { id: linkPartial.id }, data: { status: 'FAILED' } });

    const result = await cutoverToJusoLink(prisma);
    assert.equal(result.deltaCursor, '2099-07-01');
    assert.equal(result.linkBaseline, '2099-07-02');
    assert.equal(result.nextLinkDate, '2099-07-03');
    assert.equal(await findDeltaCursorDate(prisma, SOURCES.JUSO_LINK), '2099-07-02');
  });

  test('되돌리기: 공식 연계 커서 L → 일변동분 기준점 L-1(이미 적용한 날을 다시 적용하지 않음)', async () => {
    await succeeded(SOURCES.JUSO_LINK, '2099-07-03');
    await succeeded(SOURCES.JUSO_LINK, '2099-07-04');
    const result = await revertToJusoDelta(prisma);
    assert.equal(result.linkCursor, '2099-07-04');
    assert.equal(result.deltaBaseline, '2099-07-03');
    assert.equal(result.nextDeltaDate, '2099-07-04');
    assert.equal(await findDeltaCursorDate(prisma, SOURCES.JUSO_DELTA), '2099-07-03');
    await prisma.referenceDataImport.deleteMany({ where: future });
  });

  test('shadow: 실제 파일 두 경로를 계획만 해서 비교 기록을 남기고, 표(연결·단지)에는 쓰지 않는다', async () => {
    await succeeded(SOURCES.JUSO_DELTA, '2099-08-01');
    const before = await tableFingerprint();
    const result = await runShadowPhase({
      prisma,
      base: Date.now(),
      today: '2099-08-05',
      downloadLinkDays: linkDaysOn('2099-08-03'),
      downloadDelta: async () => ({ found: true, buffer: fixture('juso-delta-sample.zip'), fileName: 'sample.zip' }),
      search: async () => [],
    });
    assert.equal(result.incomplete, false);
    assert.equal(result.deltaDate, '2099-08-02');
    assert.equal(result.linkDate, '2099-08-03');
    assert.equal(typeof result.compare.compared, 'number');
    assert.ok(result.link.codes['31'] >= 1);
    assert.deepEqual(await tableFingerprint(), before);

    const rows = await prisma.referenceDataImport.findMany({ where: { source: SOURCES.JUSO_LINK_SHADOW, ...future } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].lockKey, LOCK_KEYS.JUSO_SHADOW);
    assert.equal(rows[0].status, 'SUCCEEDED');

    // 같은 날짜를 이미 비교했으면 다시 하지 않는다
    const again = await runShadowPhase({
      prisma,
      base: Date.now(),
      today: '2099-08-05',
      downloadLinkDays: linkDaysOn('2099-08-03'),
      downloadDelta: async () => ({ found: false }),
    });
    assert.deepEqual(again, { skipped: 'already compared', linkDate: '2099-08-03' });
  });

  test('shadow: 일변동분이 그 날짜를 PARTIAL로 갖고 있으면 incomplete', async () => {
    await prisma.referenceDataImport.deleteMany({ where: { source: SOURCES.JUSO_LINK_SHADOW, ...future } });
    await prisma.referenceDataImport.create({
      data: { source: SOURCES.JUSO_DELTA, lockKey: LOCK_KEYS.JUSO, fileDate: day('2099-08-02'), status: 'PARTIAL' },
    });
    const result = await runShadowPhase({
      prisma,
      base: Date.now(),
      today: '2099-08-05',
      downloadLinkDays: linkDaysOn('2099-08-03'),
      downloadDelta: async () => ({ found: false }),
    });
    assert.equal(result.incomplete, true);
    assert.equal(result.reason, 'juso delta PARTIAL');
    await prisma.referenceDataImport.deleteMany({ where: future });
  });
});

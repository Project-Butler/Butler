// juso 변동분 적용(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
// 지어낸 시군구(99999)·건물관리번호(9999910100…)·단지 코드(DBTK…)·2099년 날짜만 쓰고 끝에 지운다.
import { createDbFixture, dbTestSkip } from '../testSupport/dbTest.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prisma } from '../platform/prismaClient.js';
import { applyJusoDeltaFile } from './jusoDelta.js';
import { runJusoFullLoad } from './jusoFullLoad.js';
import { refillComplexKaptCodes } from './complexKaptCodes.js';
import { createKeySet } from './jusoLinks.js';
import { ImportAlreadyRunningError, LOCK_KEYS, SOURCES, startImport } from './referenceImports.js';

const LEGAL = '9999910100';
const MGT_PREFIX = '9999910100';
const mgt = (n) => `${MGT_PREFIX}1${String(n).padStart(14, '0')}`;
const FILLER = 200;

const line = ({ n, code, road = '테스트로', main = 1, roadCode = '999990000001', apt = '1' }) =>
  [
    LEGAL, 'TestDo', 'TestSi', 'TestDong', '', '0', '1', '0', roadCode, road, '0', String(main), '0', '', '', mgt(n), '01', '', '',
    '99999', '', '', code, '20990101', '', '', apt, '99999', '0', '', '',
  ].join('|');
const file = (lines) => Buffer.from(`${lines.join('\n')}\n`, 'utf8'); // 글자는 ASCII·한글 모두 — 아래에서 CP949로 바꾸지 않아도 되게 영문만 쓴다

const linksOf = () =>
  prisma.$queryRaw`SELECT building_mgt_no AS mgt, road_name_key AS rnk, road_main_no AS mn, kapt_code AS kc, match_rule AS mr
    FROM juso_building_links WHERE building_mgt_no LIKE ${`${MGT_PREFIX}1%`} AND building_mgt_no NOT LIKE ${`${MGT_PREFIX}19%`} ORDER BY 1`;

describe('juso 변동분 적용', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  let complex;

  before(async () => {
    const syncedAt = new Date();
    await prisma.kaptComplex.createMany({
      data: [
        { kaptCode: 'DBTK00001', name: 'DB 테스트 분양', legalDongCode: LEGAL, syncedAt, saleType: '분양' },
        { kaptCode: 'DBTK00002', name: 'DB 테스트 임대', legalDongCode: LEGAL, syncedAt, saleType: '임대' },
        { kaptCode: 'DBTK00003', name: 'DB 테스트 비활성', legalDongCode: LEGAL, syncedAt, saleType: '분양', isActive: false },
      ],
    });
    const link = (roadNameKey, roadMainNo, kaptCode) => ({
      source: 'KAPT_API', roadSigunguCd: '99999', roadNameKey, roadUnderground: false, roadMainNo, roadSubNo: 0, kaptCode,
    });
    await prisma.kaptAddressLink.createMany({
      data: [link('testro', 1, 'DBTK00001'), link('newro', 2, 'DBTK00002'), link('newro', 2, 'DBTK00001'), link('offro', 3, 'DBTK00003'), link('newro', 5, 'DBTK00002')],
    });
    // 삭제 상한(전체의 2%) 계산이 표가 비어 있어도 맞게 채움 행
    await prisma.$executeRaw`
      INSERT INTO juso_building_links (building_mgt_no, road_sigungu_cd, road_name_key, road_underground, road_main_no, road_sub_no, kapt_code, match_rule)
      SELECT ${`${MGT_PREFIX}19`} || lpad(g::text, 13, '0'), '99999', 'filler', false, g, 0, 'DBTK00001', 'ROAD_KEY'
      FROM generate_series(1, ${FILLER}) g`;
    complex = await fixture.createComplex({
      buildingMgtNo: mgt(50),
      sigunguCode: '99999',
      roadName: 'testro',
      roadNameKey: 'testro',
      roadCode: '999990000001',
      isUnderground: false,
      buildingMainNo: 1,
      buildingSubNo: 0,
      kaptCode: 'WRONG',
    });
  });

  after(async () => {
    await prisma.$executeRaw`DELETE FROM juso_building_links WHERE building_mgt_no LIKE ${`${MGT_PREFIX}%`}`;
    await prisma.kaptAddressLink.deleteMany({ where: { roadSigunguCd: '99999' } });
    await prisma.kaptComplex.deleteMany({ where: { kaptCode: { startsWith: 'DBTK' } } });
    await prisma.dataImport.deleteMany({ where: { fileDate: { gte: new Date('2099-01-01T00:00:00Z') } } });
    await fixture.cleanup();
  });

  // 첫 묶음 전에는 마감 전, 그 뒤로는 마감 후(묶음 하나만 쓰고 PARTIAL)
  const firstCallOnly = () => {
    let calls = 0;
    return () => (calls++ === 0 ? 0 : 2);
  };

  const apply = (fileDate, buffer, extra = {}) => applyJusoDeltaFile({ prisma, fileDate, fileName: `${fileDate}.txt`, buffer, allowGap: true, ...extra });

  test('모르는 이동사유코드가 있으면 FAILED, 쓰기 0', async () => {
    const result = await apply('2099-01-01', file([line({ n: 1, code: '31', road: 'testro' }), line({ n: 2, code: '99' })]));
    assert.equal(result.status, 'FAILED');
    assert.match(result.reason, /unknown change reason code: 99/);
    assert.deepEqual(await linksOf(), []);
  });

  const DAY2 = [
    line({ n: 1, code: '31', road: 'testro' }),
    line({ n: 2, code: '73', road: 'testro' }),
    line({ n: 3, code: '31', road: 'newro', main: 2 }),
    line({ n: 4, code: '31', road: 'offro', main: 3 }), // 비활성 단지 주소 → 연결 안 됨
    line({ n: 5, code: '31', road: 'nowhere', main: 9 }),
    line({ n: 2, code: '72' }),
  ];

  test('추가(31·73)·삭제(72)·분양 우선·비활성 제외, 같은 파일 다시 → SKIPPED·SUCCEEDED 하나', async () => {
    const buffer = file(DAY2);
    const first = await apply('2099-01-02', buffer, { batchSize: 2 });
    assert.equal(first.status, 'SUCCEEDED');
    assert.equal(first.stats.batches, 3);
    assert.deepEqual(
      (await linksOf()).map((row) => `${row.mgt.slice(-2)} ${row.kc} ${row.mr}`),
      ['01 DBTK00001 ROAD_KEY', '03 DBTK00001 ROAD_KEY'],
    );
    const again = await apply('2099-01-02', buffer);
    assert.deepEqual(again, { status: 'SKIPPED', reason: 'already applied', fileDate: '2099-01-02' });
    assert.equal(await prisma.dataImport.count({ where: { fileDate: new Date('2099-01-02T00:00:00Z'), status: 'SUCCEEDED' } }), 1);
  });

  test('PARTIAL → 같은 파일(SHA-1 같음)은 cursor_line부터, 내용이 바뀌면 0줄부터', async () => {
    const lines = [
      line({ n: 6, code: '31', road: 'testro' }),
      line({ n: 7, code: '31', road: 'testro' }),
      line({ n: 8, code: '31', road: 'testro' }),
      line({ n: 9, code: '31', road: 'testro' }),
    ];
    const partial = await apply('2099-01-03', file(lines), { batchSize: 2, deadlineAt: 1, clock: firstCallOnly() });
    assert.equal(partial.status, 'PARTIAL');
    assert.equal(partial.cursorLine, 2);
    const row = await prisma.dataImport.findFirst({ where: { fileDate: new Date('2099-01-03T00:00:00Z'), status: 'PARTIAL' } });
    assert.equal(row.cursorLine, 2);
    assert.equal(row.fileSha1.length, 40);

    // 전체분은 변동분 PARTIAL이 있으면 시작하지 않는다
    await assert.rejects(runJusoFullLoad({ prisma, sourcePath: '.' }), /juso delta PARTIAL/);

    // 같은 날짜 파일 내용이 바뀜(9번 줄 대신 10번) → 0줄부터 다시
    const changed = [...lines.slice(0, 3), line({ n: 10, code: '31', road: 'testro' })];
    const resumed = await apply('2099-01-03', file(changed), { batchSize: 2 });
    assert.equal(resumed.status, 'SUCCEEDED');
    assert.equal(resumed.stats.restartedFromZero, true);
    assert.equal(resumed.stats.startCursor, 0);
    const mgts = (await linksOf()).map((link) => link.mgt.slice(-2));
    assert.deepEqual(mgts, ['01', '03', '06', '07', '08', '10']);
  });

  test('PARTIAL → 같은 파일이면 cursor_line부터 이어서', async () => {
    const lines = [line({ n: 11, code: '31', road: 'testro' }), line({ n: 12, code: '31', road: 'testro' }), line({ n: 13, code: '31', road: 'testro' })];
    assert.equal((await apply('2099-01-04', file(lines), { batchSize: 1, deadlineAt: 1, clock: firstCallOnly() })).status, 'PARTIAL');
    const resumed = await apply('2099-01-04', file(lines), { batchSize: 1 });
    assert.equal(resumed.status, 'SUCCEEDED');
    assert.equal(resumed.stats.startCursor, 1);
    assert.equal(resumed.stats.restartedFromZero, false);
  });

  test('34로 단지 대표 건물의 도로명이 바뀌면 단지 주소 칸·road_name_key가 바뀌고 kapt_code가 새 키로, source_key 그대로', async () => {
    const keySet = createKeySet();
    const result = await apply('2099-01-05', file([line({ n: 50, code: '34', road: 'newro', main: 5, roadCode: '999990000005' })]), { keySet });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.stats.complexesUpdated, 1);
    const before = await prisma.complex.findUnique({ where: { id: complex.id } });
    assert.equal(before.roadNameKey, 'newro');
    assert.equal(before.buildingMainNo, 5);
    assert.equal(before.roadCode, '999990000005');
    assert.equal(before.sourceKey, complex.sourceKey);
    assert.equal(before.updatedAt.getTime(), complex.updatedAt.getTime());

    const changed = await refillComplexKaptCodes(prisma, keySet.values());
    assert.equal(changed, 1);
    const after1 = await prisma.complex.findUnique({ where: { id: complex.id } });
    assert.equal(after1.kaptCode, 'DBTK00002');
    assert.equal(after1.updatedAt.getTime(), complex.updatedAt.getTime());
    // 값이 같으면 UPDATE 수에 안 들어감
    assert.equal(await refillComplexKaptCodes(prisma, keySet.values()), 0);
  });

  test('is_active=false 단지는 kaptCode 다시 채우기에서 빠진다', async () => {
    await prisma.$executeRaw`UPDATE complexes SET road_name_key = 'offro', building_main_no = 3, kapt_code = 'DBTK00003' WHERE id = ${complex.id}::uuid`;
    assert.equal(await refillComplexKaptCodes(prisma, [{ sigunguCd: '99999', roadNameKey: 'offro', underground: false, mainNo: 3, subNo: 0 }]), 1);
    assert.equal((await prisma.complex.findUnique({ where: { id: complex.id } })).kaptCode, null);
  });

  test('같은 표에 쓰는 실행은 동시에 하나만 RUNNING(lock_key 부분 유니크)', async () => {
    const data = { source: SOURCES.JUSO_DELTA, lockKey: LOCK_KEYS.JUSO, fileDate: new Date('2099-01-06T00:00:00Z') };
    const results = await Promise.allSettled([startImport(prisma, data), startImport(prisma, { ...data, source: SOURCES.JUSO_FULL })]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.ok(results.find((result) => result.status === 'rejected').reason instanceof ImportAlreadyRunningError);
    await prisma.dataImport.updateMany({ where: { fileDate: data.fileDate }, data: { status: 'FAILED' } });
  });
});

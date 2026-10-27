// 공식 연계 하루치 적용(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
// 지어낸 시군구(99998)·건물관리번호(9999810100…)·단지 코드(DBTL…)·2099년 날짜만 쓰고 끝에 지운다.
import { createDbFixture, dbTestSkip } from '../testSupport/dbTest.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prisma } from '../platform/prismaClient.js';
import { refillComplexKaptCodes } from './complexKaptCodes.js';
import { applyJusoLinkDay } from './jusoLinkApply.js';
import { createKeySet } from './jusoLinks.js';
import { setCursorBaseline, SOURCES } from './referenceImports.js';

const LEGAL = '9999810100';
const mgt = (n) => `${LEGAL}1${String(n).padStart(14, '0')}`;
const ROAD = '999980000001';
const roadMgt = (main) => `${LEGAL}${ROAD.slice(5)}0${String(main).padStart(5, '0')}00000`.slice(0, 26);

const dong = ({ n, code, main = 1, roadCode = ROAD }) =>
  [LEGAL, '', `${n}dong`, '', roadCode, '0', String(main), '0', roadMgt(main), mgt(n), code].join('|');
const mst = ({ main = 1, road = 'linkro', apt = '1', code = '31' }) =>
  [roadMgt(main), LEGAL, 'TestDo', 'TestSi', 'TestDong', '', '0', '1', '0', ROAD, road, '0', String(main), '0',
    '9999800000', 'TestDong', '99999', '', '20990101', apt, code, '', '', ''].join('|');
const rdnm = ({ road }) =>
  ['99998', ROAD.slice(5), '00', road, 'Eng', 'TestDo', 'TestSi', '1', '', '', '0', 'reason', '0', '', '', '', '', '1', '9', '20990101', ''].join('|');

const tablesOf = ({ dongs = [], msts = [], rdnms = [] }) => ({
  TH_RNSPBD_DONG: dongs,
  TH_SGCO_RNADR_MST: msts,
  TH_SGCO_RNADR_LNBR: [],
  TI_SPRD_RDNM: rdnms,
});

const linksOf = () =>
  prisma.$queryRaw`SELECT building_mgt_no AS mgt, road_name_key AS rnk, kapt_code AS kc, match_rule AS mr
    FROM juso_building_links WHERE building_mgt_no LIKE ${`${LEGAL}%`} ORDER BY 1`;

describe('공식 연계 하루치 적용', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const noSearch = async () => [];
  let complex;

  before(async () => {
    const syncedAt = new Date();
    await prisma.kaptComplex.createMany({
      data: [{ kaptCode: 'DBTL00001', name: 'DB 연계 분양', legalDongCode: LEGAL, syncedAt, saleType: '분양' }],
    });
    await prisma.kaptAddressLink.create({
      data: { source: 'KAPT_API', roadSigunguCd: '99998', roadNameKey: 'linkro', roadUnderground: false, roadMainNo: 1, roadSubNo: 0, kaptCode: 'DBTL00001' },
    });
    // 표가 비어 있어도 삭제 상한(2%) 계산이 맞게 채움 행
    await prisma.$executeRaw`
      INSERT INTO juso_building_links (building_mgt_no, road_sigungu_cd, road_name_key, road_underground, road_main_no, road_sub_no, kapt_code, match_rule)
      SELECT ${`${LEGAL}9`} || lpad(g::text, 14, '0'), '99998', 'filler', false, g, 0, 'DBTL00001', 'ROAD_KEY' FROM generate_series(1, 200) g`;
    complex = await fixture.createComplex({
      buildingMgtNo: mgt(1),
      sigunguCode: '99998',
      roadName: 'linkro',
      roadNameKey: 'linkro',
      roadCode: ROAD,
      roadAddress: 'TestDo TestSi linkro 1 (linkro)',
      isUnderground: false,
      buildingMainNo: 1,
      buildingSubNo: 0,
      kaptCode: 'DBTL00001',
    });
  });

  after(async () => {
    await prisma.$executeRaw`DELETE FROM juso_building_links WHERE building_mgt_no LIKE ${`${LEGAL}%`}`;
    await prisma.kaptAddressLink.deleteMany({ where: { roadSigunguCd: '99998' } });
    await prisma.kaptComplex.deleteMany({ where: { kaptCode: { startsWith: 'DBTL' } } });
    await prisma.referenceDataImport.deleteMany({ where: { fileDate: { gte: new Date('2099-01-01T00:00:00Z') } } });
    await fixture.cleanup();
  });

  const apply = (linkDate, tables, extra = {}) =>
    applyJusoLinkDay({ prisma, linkDate, tables, fileSize: 1n, fileSha1: `sha-${linkDate}`.padEnd(40, '0'), search: noSearch, ...extra });

  test('기준점(cutover)이 없으면 적용하지 않는다', async () => {
    const result = await apply('2099-06-01', tablesOf({ dongs: [dong({ n: 1, code: '31' })] }));
    assert.deepEqual(result, { status: 'SKIPPED', reason: 'no baseline (run juso-link:cutover first)', fileDate: '2099-06-01' });
  });

  test('신규(도로명은 같은 날 100001) → ROAD_KEY, 도로명 모르는 34는 기존 연결 유지, 63은 삭제, 같은 날짜 다시 → SKIPPED', async () => {
    await setCursorBaseline(prisma, SOURCES.JUSO_LINK, '2099-06-01', { reason: 'test' });
    const first = await apply('2099-06-02', tablesOf({ dongs: [dong({ n: 1, code: '31' }), dong({ n: 2, code: '31' })], msts: [mst({})] }));
    assert.equal(first.status, 'SUCCEEDED');
    assert.deepEqual((await linksOf()).filter((row) => !row.mgt.startsWith(`${LEGAL}9`)).map((row) => `${row.mgt.slice(-1)} ${row.kc} ${row.mr}`), [
      '1 DBTL00001 ROAD_KEY',
      '2 DBTL00001 ROAD_KEY',
    ]);

    // 다음 날: 1번은 34지만 100001이 없고 기존 연결의 규칙이 ROAD_KEY(공동주택 근거 아님), 도로명 키는 같은 도로명코드의 연결에서 →
    // 불변 규칙으로 같은 단지(NON_APT_FLAG). 2번은 63 → 삭제. 3번은 도로명코드도 처음 보는 34 → unresolved(쓰지 않음).
    const second = await apply(
      '2099-06-03',
      tablesOf({ dongs: [dong({ n: 1, code: '34' }), dong({ n: 2, code: '63' }), dong({ n: 3, code: '34', roadCode: '999980000077' })] }),
    );
    assert.equal(second.status, 'SUCCEEDED');
    const rows = (await linksOf()).filter((row) => !row.mgt.startsWith(`${LEGAL}9`));
    assert.deepEqual(rows.map((row) => `${row.mgt.slice(-1)} ${row.kc} ${row.mr}`), ['1 DBTL00001 NON_APT_FLAG']);
    // 3번은 기존 연결도 K-apt 후보도 없어서 판단 대상이 아니다(게이트 분모·분자에 안 들어감)
    assert.equal(second.stats.unresolvedCount, 0);
    assert.equal(second.stats.ignoredUnresolved, 1);

    const again = await apply('2099-06-03', tablesOf({ dongs: [dong({ n: 2, code: '31' })] }));
    assert.deepEqual(again, { status: 'SKIPPED', reason: 'already applied', fileDate: '2099-06-03' });
  });

  test('도로명 변경(100005): 같은 도로명코드의 연결·단지 주소가 새 이름으로, 단지 kapt_code는 지워지지 않는다', async () => {
    const keySet = createKeySet();
    const result = await apply('2099-06-04', tablesOf({ rdnms: [rdnm({ road: 'renamedro' })] }), { keySet });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.stats.renamedLinks, 1);
    assert.equal(result.stats.renamedComplexes, 1);
    assert.deepEqual((await linksOf()).filter((row) => !row.mgt.startsWith(`${LEGAL}9`)).map((row) => row.rnk), ['renamedro']);
    const renamed = await prisma.complex.findUnique({ where: { id: complex.id } });
    assert.equal(renamed.roadName, 'renamedro');
    assert.equal(renamed.roadNameKey, 'renamedro');
    assert.equal(renamed.roadAddress, 'TestDo TestSi renamedro 1 (linkro)'); // 처음 나오는 한 곳만

    await refillComplexKaptCodes(prisma, keySet.values());
    assert.equal((await prisma.complex.findUnique({ where: { id: complex.id } })).kaptCode, 'DBTL00001');
  });

  test('도로명이 바뀐 뒤의 34: K-apt 주소가 옛 이름이라 도로명 키 후보가 없어도 기존 연결을 지우지 않는다', async () => {
    const result = await apply('2099-06-05', tablesOf({ dongs: [dong({ n: 1, code: '34' })], msts: [mst({ road: 'renamedro', apt: '0', code: '34' })] }));
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.stats.unresolved[0].reason, 'road name changed');
    assert.equal((await linksOf()).filter((row) => row.mgt === mgt(1)).length, 1);
  });

  test('unresolved가 판단 대상의 1%를 넘고 5건 이상이면 FAILED, 쓰기 0', async () => {
    // 기존 연결 5개를 만들고, 도로명을 모르는 34로 다시 보낸다
    await prisma.$executeRaw`
      INSERT INTO juso_building_links (building_mgt_no, road_sigungu_cd, road_name_key, road_underground, road_main_no, road_sub_no, road_code, kapt_code, match_rule)
      SELECT ${`${LEGAL}1`} || lpad((100 + g)::text, 14, '0'), '99998', 'x', false, 1, 0, '999980000088', 'DBTL00001', 'ROAD_KEY'
      FROM generate_series(1, 5) g`;
    const dongs = [1, 2, 3, 4, 5].map((g) => dong({ n: 100 + g, code: '34', roadCode: '999980000099' }));
    const result = await apply('2099-06-06', tablesOf({ dongs }));
    assert.equal(result.status, 'FAILED');
    assert.equal(result.reason, 'too many unresolved 5/5');
    assert.equal(await prisma.referenceDataImport.count({ where: { source: SOURCES.JUSO_LINK, fileDate: new Date('2099-06-06T00:00:00Z'), status: 'FAILED' } }), 1);
  });
});

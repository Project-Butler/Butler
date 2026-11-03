// 엑셀 갱신: 빈 칸·파일에 없는 연결을 지우지 않는지(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
// 2099년 날짜와 DBKE 단지코드만 쓰고 끝에 지운다.
import { dbTestSkip } from '../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prisma } from '../../src/platform/prismaClient.js';
import { EXCEL_GATE, runKaptExcelImport } from '../../src/referenceData/kaptExcel.js';

const CODE = 'DBKE00001';
const LEGAL = '1111010100';
const LOOSE_GATE = { ...EXCEL_GATE, minRowsRead: 1, minParsedRate: 0, minFilledRate: 0, maxRateDropFromLast: 1, minRowsReadRatioFromLast: 0 };
const HEADER = [undefined, '단지코드', '단지명', '법정동주소', '도로명주소', '분양형태', '사용승인일', '동수', '세대수'];
const toRows = (...rows) => async () => [['안내문'], HEADER, ...rows.map((row) => [undefined, CODE, 'DB 엑셀', ...row])];
const JIBUN = '서울특별시 종로구 청운동 1 DB 엑셀';

const findComplex = () => prisma.kaptComplex.findUnique({ where: { kaptCode: CODE } });
const findRoadKeys = async () =>
  (await prisma.kaptAddressLink.findMany({ where: { kaptCode: CODE, source: 'KAPT_EXCEL' }, orderBy: { roadMainNo: 'asc' } })).map(
    (link) => link.roadMainNo,
  );

describe('엑셀 갱신', { skip: dbTestSkip }, () => {
  before(async () => {
    await prisma.kaptComplex.create({ data: { kaptCode: CODE, name: 'DB 엑셀', legalDongCode: LEGAL, syncedAt: new Date() } });
  });

  after(async () => {
    await prisma.kaptAddressLink.deleteMany({ where: { kaptCode: CODE } });
    await prisma.kaptComplex.deleteMany({ where: { kaptCode: CODE } });
    await prisma.dataImport.deleteMany({ where: { source: 'KAPT_EXCEL', fileDate: { gte: new Date('2099-01-01T00:00:00Z') } } });
  });

  test('여러 줄 파일 다음에 한 줄 파일이 와도 추가 도로명주소를 지우지 않고, 값은 갱신한다', async () => {
    await runKaptExcelImport({
      prisma,
      filePath: 'old.xlsx',
      fileDate: '2099-01-01',
      gate: LOOSE_GATE,
      readRows: toRows(
        [JIBUN, '서울특별시 종로구 디비엑셀로 1', '분양', '20000101', '2', '100'],
        [JIBUN, '서울특별시 종로구 디비엑셀로 2', '분양', '20000101', '2', '100'],
      ),
    });
    assert.deepEqual(await findRoadKeys(), [1, 2]);

    await runKaptExcelImport({
      prisma,
      filePath: 'new.xlsx',
      fileDate: '2099-01-08',
      gate: LOOSE_GATE,
      readRows: toRows([JIBUN, '서울특별시 종로구 디비엑셀로 2', '혼합', '20000202', '3', '120']),
    });
    assert.deepEqual(await findRoadKeys(), [1, 2]);
    const complex = await findComplex();
    assert.equal(complex.roadAddress, '서울특별시 종로구 디비엑셀로 2');
    assert.equal(complex.saleType, '혼합');
    assert.equal(complex.buildingCount, 3);
    assert.equal(complex.householdCount, 120);
    assert.equal(complex.basisFileDate.toISOString().slice(0, 10), '2099-01-08');
  });

  test('빈 칸은 기존 값을 지우지 않는다', async () => {
    await runKaptExcelImport({
      prisma,
      filePath: 'blank.xlsx',
      fileDate: '2099-01-15',
      gate: LOOSE_GATE,
      readRows: toRows([JIBUN, '', '', '', '', '']),
    });
    const complex = await findComplex();
    assert.equal(complex.roadAddress, '서울특별시 종로구 디비엑셀로 2');
    assert.equal(complex.saleType, '혼합');
    assert.equal(complex.approvalDate.toISOString().slice(0, 10), '2000-02-02');
    assert.equal(complex.buildingCount, 3);
    assert.equal(complex.householdCount, 120);
    assert.equal(complex.basisFileDate.toISOString().slice(0, 10), '2099-01-15');
  });

  test('게이트에 막히면 쓰지 않고 FAILED로 남긴다', async () => {
    await assert.rejects(
      runKaptExcelImport({
        prisma,
        filePath: 'bad.xlsx',
        fileDate: '2099-01-22',
        gate: { ...LOOSE_GATE, minFilledRate: EXCEL_GATE.minFilledRate },
        readRows: toRows([JIBUN, '서울특별시 종로구 디비엑셀로 3', '', '', '', '']),
      }),
      /filled rate/,
    );
    assert.deepEqual(await findRoadKeys(), [1, 2]);
    assert.equal((await findComplex()).basisFileDate.toISOString().slice(0, 10), '2099-01-15');
    const run = await prisma.dataImport.findFirst({ where: { source: 'KAPT_EXCEL', fileDate: new Date('2099-01-22T00:00:00Z') } });
    assert.equal(run.status, 'FAILED');
  });
});

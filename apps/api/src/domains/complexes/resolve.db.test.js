// resolve 동시성(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../testSupport/dbTest.js';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { prisma } from '../../platform/prismaClient.js';
import { resolveComplex } from './service.js';

describe('resolve 동시성', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  after(() => fixture.cleanup());

  test('같은 sourceKey를 동시에 resolve → 단지 1개, 같은 id', async () => {
    // 지어낸 도로명코드(999…)라 실제 검색 결과와 겹치지 않는다. 건물관리번호도 지어낸 값.
    const sourceKey = `ROAD:99999${String(Date.now()).slice(-7)}-0-1-0`;
    fixture.trackSourceKey(sourceKey);
    await prisma.addressSearchResult.create({
      data: {
        sourceKey,
        payload: {
          roadAddr: '서울특별시 노원구 테스트로 1',
          jibunAddr: '서울특별시 노원구 중계동 1',
          zipNo: '01700',
          admCd: '1135010600',
          rn: '테스트로',
          rnMgtSn: sourceKey.slice(5, 17),
          udrtYn: '0',
          buldMnnm: '1',
          buldSlno: '0',
          mtYn: '0',
          lnbrMnnm: '1',
          lnbrSlno: '0',
          bdMgtSn: `9999${String(Date.now()).padStart(21, '0')}`.slice(0, 25),
          bdNm: 'DB 테스트 아파트',
          detBdNmList: '101동,102동',
        },
      },
    });

    const results = await Promise.all([resolveComplex(sourceKey), resolveComplex(sourceKey), resolveComplex(sourceKey)]);

    assert.equal(new Set(results.map((result) => result.id)).size, 1);
    assert.equal(await prisma.complex.count({ where: { sourceKey } }), 1);
    assert.deepEqual(results[0].detailBuildingNames, ['101동', '102동']);
    assert.equal(results[0].zipCode, '01700');
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findKaptByRoadKeys, pickBestKapt, rankSaleType, toRoadLinkKey } from './kaptLinks.js';

test('rank: 분양·혼합 0, 임대 1, 그 밖·모름 2', () => {
  assert.equal(rankSaleType('분양'), 0);
  assert.equal(rankSaleType('혼합'), 0);
  assert.equal(rankSaleType(' 임대 '), 1);
  assert.equal(rankSaleType('기타'), 2);
  assert.equal(rankSaleType(null), 2);
});

test('후보 고르기: rank가 작은 것, 같으면 kaptCode 오름차순', () => {
  const rows = [
    { kaptCode: 'A1', name: '임대단지', saleType: '임대' },
    { kaptCode: 'A9', name: '분양단지', saleType: '분양' },
    { kaptCode: 'A5', name: '혼합단지', saleType: '혼합' },
  ];
  assert.deepEqual(pickBestKapt(rows), { kaptCode: 'A5', name: '혼합단지', saleType: '혼합' });
  assert.equal(pickBestKapt([{ kaptCode: 'B2', name: 'x', saleType: null }, { kaptCode: 'B1', name: 'y', saleType: null }]).kaptCode, 'B1');
  assert.equal(pickBestKapt([]), null);
});

test('도로명 키: juso 칸에서 시군구·도로명·지하·본번·부번', () => {
  const payload = { admCd: '1135010600', rn: '노원로 1길', udrtYn: '0', buldMnnm: '10', buldSlno: '0' };
  assert.deepEqual(toRoadLinkKey(payload), {
    sigunguCd: '11350',
    roadNameKey: '노원로1길',
    underground: false,
    mainNo: 10,
    subNo: 0,
  });
  assert.equal(toRoadLinkKey({ ...payload, udrtYn: '1' }).underground, true);
  assert.equal(toRoadLinkKey({ ...payload, rn: '' }), null);
  assert.equal(toRoadLinkKey({ ...payload, admCd: '11350' }), null);
});

test('연결 조회: 키가 없으면 쿼리하지 않고, 결과는 키 순서대로', async () => {
  let queries = 0;
  const client = {
    $queryRaw: async () => {
      queries += 1;
      return [
        { idx: 2, kaptCode: 'A2', name: '둘', saleType: '임대' },
        { idx: 2, kaptCode: 'A3', name: '셋', saleType: '분양' },
      ];
    },
  };
  assert.deepEqual(await findKaptByRoadKeys(client, [null, null]), [null, null]);
  assert.equal(queries, 0);

  const key = { sigunguCd: '11350', roadNameKey: '노원로', underground: false, mainNo: 1, subNo: 0 };
  const result = await findKaptByRoadKeys(client, [key, null, key]);
  assert.equal(queries, 1);
  assert.deepEqual(result, [null, null, { kaptCode: 'A3', name: '셋', saleType: '분양' }]);
});

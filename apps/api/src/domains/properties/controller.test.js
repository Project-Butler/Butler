// POST /properties 요청 검증(면적·층·빈 동·한 칸 입력·방 구성·설비)을 가짜 prisma로 확인한다(DB 없음).
// 검증을 통과한 요청은 트랜잭션 안 호실 upsert에서 멈추고, 그때 넘어간 값(정규화된 동·호)을 본다.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { prisma } from '../../platform/prismaClient.js';
import { createProperty } from './controller.js';

const COMPLEX_ID = '11111111-1111-4111-8111-111111111111';
const USER = { id: '00000000-0000-4000-8000-000000000001', role: 'LANDLORD' };
const REACHED_UPSERT = new Error('reached property upsert');

let upserts;

beforeEach(() => {
  upserts = [];
  const tx = {
    complex: { findUnique: async () => ({ id: COMPLEX_ID, name: '중계그린' }) },
    // ensureLandlordBuilding(INSERT … RETURNING) → [], lockLandlordBuilding(SELECT … FOR UPDATE) → 행 1개
    $queryRaw: async (strings) =>
      strings.join('').includes('FOR UPDATE') ? [{ id: 'b1', complexId: COMPLEX_ID, name: '중계그린', capacity: null }] : [],
    activity: { create: async () => ({}) },
    property: {
      upsert: async (args) => {
        upserts.push(args);
        throw REACHED_UPSERT;
      },
    },
  };
  prisma.$transaction = async (fn) => fn(tx);
});

// 컨트롤러를 부르고 next로 넘어간 에러를 돌려준다.
const post = async (body) => {
  let passed;
  await createProperty({ user: USER, body }, {}, (error) => {
    passed = error;
  });
  return passed;
};

const base = { complexId: COMPLEX_ID, buildingNo: '114', unitNo: '410' };

const fieldsOf = (error) => error.details.map((detail) => detail.field);

test('면적: 소수 둘째 자리까지 그대로(39.78 통과), 셋째 자리부터 400(반올림하지 않음)', async () => {
  assert.equal(await post({ ...base, exclusiveArea: 39.78 }), REACHED_UPSERT);
  assert.equal(upserts[0].create.exclusiveArea, '39.78');

  const error = await post({ ...base, exclusiveArea: 39.785 });
  assert.equal(error.code, 'VALIDATION_ERROR');
  assert.deepEqual(fieldsOf(error), ['exclusiveArea']);
  assert.equal((await post({ ...base, exclusiveArea: '39.785' })).code, 'VALIDATION_ERROR');
  assert.equal((await post({ ...base, exclusiveArea: 0 })).code, 'VALIDATION_ERROR');
});

test('층: -10~200 정수(지하 B1은 화면이 -1로 보냄)', async () => {
  assert.equal(await post({ ...base, floor: -1 }), REACHED_UPSERT);
  assert.equal(upserts[0].create.floor, -1);
  assert.deepEqual(fieldsOf(await post({ ...base, floor: -11 })), ['floor']);
  assert.deepEqual(fieldsOf(await post({ ...base, floor: 201 })), ['floor']);
  assert.deepEqual(fieldsOf(await post({ ...base, floor: 1.5 })), ['floor']);
});

test('빈 동(동 없는 건물, C6): 생략·빈 값·"동"만 → 빈 문자열로 저장', async () => {
  for (const buildingNo of [undefined, null, '', ' 동 ']) {
    upserts = [];
    assert.equal(await post({ complexId: COMPLEX_ID, buildingNo, unitNo: '410호' }), REACHED_UPSERT, String(buildingNo));
    assert.equal(upserts[0].where.complexId_buildingNo_unitNo.buildingNo, '');
    assert.equal(upserts[0].where.complexId_buildingNo_unitNo.unitNo, '410');
  }
  assert.deepEqual(fieldsOf(await post({ ...base, buildingNo: 101 })), ['buildingNo']);
});

test('빈 동이어도 호 칸에 동·호를 몰아 쓰면 400 "동과 호를 나눠 입력해 주세요"', async () => {
  for (const unitNo of ['101-1203', '101동 1203호']) {
    const error = await post({ complexId: COMPLEX_ID, buildingNo: '', unitNo });
    assert.equal(error.code, 'VALIDATION_ERROR', unitNo);
    assert.deepEqual(error.details, [{ field: 'unitNo', reason: '동과 호를 나눠 입력해 주세요' }]);
  }
});

test('호는 여전히 필수', async () => {
  assert.deepEqual(fieldsOf(await post({ complexId: COMPLEX_ID, buildingNo: '101' })), ['unitNo']);
});

test('방 구성·설비: 상수 값만, 기타 설비 200자', async () => {
  assert.equal(
    await post({ ...base, unitType: 'OFFICETEL', equipment: ['BED', 'TV'], equipmentEtc: '건조기' }),
    REACHED_UPSERT,
  );
  const error = await post({ ...base, unitType: 'VILLA', equipment: ['JACUZZI'], equipmentEtc: 'x'.repeat(201) });
  assert.deepEqual(fieldsOf(error), ['unitType', 'equipment', 'equipmentEtc']);
  assert.deepEqual(fieldsOf(await post({ ...base, color: 'red' })), ['color']);
});

// 법정동(Region) 테이블 시딩. 외부 API로 lazy 생성하지 않고 셋업 시점에 한 번에 채운다
// (노션 6번 Prisma 스키마 참고). 데이터 출처/교체 방법은 seed-data/README.md.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const CSV_PATH = path.join(__dirname, 'seed-data', 'legal-dong-codes.csv');
const EXPECTED_COLUMNS = ['legalDongCode', 'sidoName', 'sigunguName', 'dongName', 'fullName'];
const NAME_FIELDS = ['sidoName', 'sigunguName', 'dongName', 'fullName'];
const BATCH_SIZE = 1000;
// 전국 동 단위는 5천 건 남짓이다. 이보다 크게 적으면 CSV가 잘못된 것이라, 기존 법정동을 한꺼번에
// 비활성으로 바꾸기 전에 멈춘다.
const MIN_EXPECTED_ROWS = 4000;

const parseCsv = (text) => {
  const lines = text
    .replace(/^﻿/, '') // UTF-8 BOM 제거
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const header = lines[0].split(',').map((col) => col.trim());
  const missing = EXPECTED_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    throw new Error(`legal-dong-codes.csv 헤더에 ${missing.join(', ')} 컬럼이 없습니다.`);
  }

  return lines.slice(1).map((line) => {
    // 세종처럼 시군구가 없는 행은 sigunguName이 빈 문자열이다(non-null 컬럼).
    const cells = line.split(',').map((cell) => cell.trim());
    return Object.fromEntries(header.map((col, i) => [col, cells[i] ?? '']));
  });
};

const isChanged = (existing, row) =>
  !existing.isActive || NAME_FIELDS.some((field) => existing[field] !== row[field]);

const main = async () => {
  // CSV 머리글은 legalDongCode, DB 칸은 regions.id(법정동코드)
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf-8')).map(({ legalDongCode, ...names }) => ({ id: legalDongCode, ...names }));
  if (rows.length < MIN_EXPECTED_ROWS) {
    throw new Error(`legal-dong-codes.csv가 ${rows.length}건뿐입니다. seed-data/README.md 절차로 전체 자료를 다시 만드세요.`);
  }
  const csvCodes = new Set(rows.map((row) => row.id));

  const existingRows = await prisma.region.findMany();
  const existingByCode = new Map(existingRows.map((region) => [region.id, region]));

  // 5천 건 넘게 행마다 upsert하면 느려서, 새 코드는 묶어서 넣고 바뀐 행만 고친다.
  const newRows = rows.filter((row) => !existingByCode.has(row.id));
  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    await prisma.region.createMany({ data: newRows.slice(i, i + BATCH_SIZE), skipDuplicates: true });
  }

  const changedRows = rows.filter((row) => {
    const existing = existingByCode.get(row.id);
    return existing && isChanged(existing, row);
  });
  for (const row of changedRows) {
    const { id, ...names } = row;
    await prisma.region.update({ where: { id }, data: { ...names, isActive: true } });
  }

  // 새 CSV에서 빠진(폐지된) 코드는 지우지 않는다 — complexes가 FK로 참조할 수 있어서
  // isActive만 false로 바꾼다.
  const removedCodes = existingRows
    .filter((region) => region.isActive && !csvCodes.has(region.id))
    .map((region) => region.id);
  if (removedCodes.length > 0) {
    await prisma.region.updateMany({
      where: { id: { in: removedCodes } },
      data: { isActive: false },
    });
  }

  console.info(
    `[seed] Region 전체 ${rows.length}건 — 추가 ${newRows.length}, 변경 ${changedRows.length}, 비활성 ${removedCodes.length}.`,
  );
};

// 로컬 확인용 계정(README의 fixture 계정). 비밀번호가 모두 같아서 로컬 DB에만 넣는다 —
// DATABASE_URL이 localhost가 아니면(Supabase 등) 건너뛴다. 이미 있는 계정은 건드리지 않는다.
const DEV_PASSWORD = 'password123';
const DEV_USERS = [
  { id: '00000000-0000-4000-8000-000000000001', email: 'landlord@butler.test', name: '김집주', phone: '01011112222', role: 'LANDLORD' },
  { id: '00000000-0000-4000-8000-000000000002', email: 'tenant@butler.test', name: '이세입', phone: '01033334444', role: 'TENANT' },
  { id: '00000000-0000-4000-8000-000000000003', email: 'admin@butler.test', name: '박운영', phone: '01055556666', role: 'ADMIN' },
];

const isLocalDatabase = () => {
  try {
    return ['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname);
  } catch {
    return false;
  }
};

const seedDevUsers = async () => {
  if (!isLocalDatabase()) {
    console.info('[seed] 로컬 DB가 아니라 로컬 확인용 계정은 건너뜁니다.');
    return;
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  for (const user of DEV_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
  }
  console.info(`[seed] 로컬 확인용 계정 ${DEV_USERS.length}개 확인.`);
};

main()
  .then(seedDevUsers)
  .catch((error) => {
    console.error('[seed] 실패:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

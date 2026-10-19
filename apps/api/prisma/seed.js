// 법정동(Region) 테이블 시딩. 외부 API로 lazy 생성하지 않고 셋업 시점에 한 번에 채운다
// (docs/api-contract.md 2장 "구현 참고" 참고). 데이터 출처/교체 방법은 seed-data/README.md.
import { PrismaClient } from '@prisma/client';
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
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf-8'));
  if (rows.length < MIN_EXPECTED_ROWS) {
    throw new Error(`legal-dong-codes.csv가 ${rows.length}건뿐입니다. seed-data/README.md 절차로 전체 자료를 다시 만드세요.`);
  }
  const csvCodes = new Set(rows.map((row) => row.legalDongCode));

  const existingRows = await prisma.region.findMany();
  const existingByCode = new Map(existingRows.map((region) => [region.legalDongCode, region]));

  // 5천 건 넘게 행마다 upsert하면 느려서, 새 코드는 묶어서 넣고 바뀐 행만 고친다.
  const newRows = rows.filter((row) => !existingByCode.has(row.legalDongCode));
  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    await prisma.region.createMany({ data: newRows.slice(i, i + BATCH_SIZE), skipDuplicates: true });
  }

  const changedRows = rows.filter((row) => {
    const existing = existingByCode.get(row.legalDongCode);
    return existing && isChanged(existing, row);
  });
  for (const row of changedRows) {
    const { legalDongCode, ...names } = row;
    await prisma.region.update({ where: { legalDongCode }, data: { ...names, isActive: true } });
  }

  // 새 CSV에서 빠진(폐지된) 코드는 지우지 않는다 — complexes가 FK로 참조할 수 있어서
  // isActive만 false로 바꾼다.
  const removedCodes = existingRows
    .filter((region) => region.isActive && !csvCodes.has(region.legalDongCode))
    .map((region) => region.legalDongCode);
  if (removedCodes.length > 0) {
    await prisma.region.updateMany({
      where: { legalDongCode: { in: removedCodes } },
      data: { isActive: false },
    });
  }

  console.info(
    `[seed] Region 전체 ${rows.length}건 — 추가 ${newRows.length}, 변경 ${changedRows.length}, 비활성 ${removedCodes.length}.`,
  );
};

main()
  .catch((error) => {
    console.error('[seed] 실패:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

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
    const cells = line.split(',').map((cell) => cell.trim());
    return Object.fromEntries(header.map((col, i) => [col, cells[i]]));
  });
};

const main = async () => {
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf-8'));

  if (rows.length <= 1) {
    console.warn(
      `[seed] ${rows.length}건만 들어있습니다 — 지금은 개발용 샘플입니다. ` +
        '운영 전 prisma/seed-data/README.md 안내대로 전체 데이터로 교체하세요.',
    );
  }

  let count = 0;
  for (const row of rows) {
    await prisma.region.upsert({
      where: { legalDongCode: row.legalDongCode },
      update: {
        sidoName: row.sidoName,
        sigunguName: row.sigunguName,
        dongName: row.dongName,
        fullName: row.fullName,
      },
      create: { ...row },
    });
    count += 1;
  }

  console.log(`[seed] Region ${count}건 완료.`);
};

main()
  .catch((error) => {
    console.error('[seed] 실패:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

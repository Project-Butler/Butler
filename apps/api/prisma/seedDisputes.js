// 분쟁 참고자료(DisputeReference) 시딩. seed-data/disputes.json을 읽어 sourceKey 기준으로
// upsert한다 — 여러 번 실행해도 건수가 늘지 않는다. 데이터 출처는 seed-data/README.md.
// 실행: npm run seed:disputes -w apps/api
import { DisputeCategory, DisputePropertyKind, DisputeReferenceType, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const JSON_PATH = path.join(__dirname, 'seed-data', 'disputes.json');
const REQUIRED_FIELDS = ['sourceKey', 'type', 'category', 'title', 'summary', 'content', 'sourceTitle'];
const ENUM_FIELDS = {
  type: DisputeReferenceType,
  propertyKind: DisputePropertyKind,
  category: DisputeCategory,
};

const validate = (rows) => {
  const seen = new Set();
  const errors = [];

  rows.forEach((row, i) => {
    const label = row.sourceKey ?? `#${i}`;
    REQUIRED_FIELDS.filter((field) => !row[field]).forEach((field) => errors.push(`${label}: ${field} 없음`));
    Object.entries(ENUM_FIELDS).forEach(([field, allowed]) => {
      if (row[field] && !Object.values(allowed).includes(row[field])) {
        errors.push(`${label}: ${field} 값 ${row[field]}이 enum에 없음`);
      }
    });
    if (seen.has(row.sourceKey)) errors.push(`${label}: sourceKey 중복`);
    seen.add(row.sourceKey);
  });

  if (errors.length > 0) {
    throw new Error(`disputes.json 검증 실패\n${errors.join('\n')}`);
  }
};

const toRecord = (row) => ({
  type: row.type,
  propertyKind: row.propertyKind ?? null,
  category: row.category,
  title: row.title,
  summary: row.summary,
  content: row.content,
  outcome: row.outcome ?? null,
  caseNumber: row.caseNumber ?? null,
  relatedLaws: row.relatedLaws ?? [],
  keywords: row.keywords ?? [],
  sourceTitle: row.sourceTitle,
  sourcePage: row.sourcePage ?? null,
});

const main = async () => {
  const rows = JSON.parse(readFileSync(JSON_PATH, 'utf-8'));
  validate(rows);

  for (const row of rows) {
    const record = toRecord(row);
    await prisma.disputeReference.upsert({
      where: { sourceKey: row.sourceKey },
      update: record,
      create: { sourceKey: row.sourceKey, ...record },
    });
  }

  console.info(`[seed:disputes] DisputeReference ${rows.length}건 완료.`);
};

main()
  .catch((error) => {
    console.error('[seed:disputes] 실패:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

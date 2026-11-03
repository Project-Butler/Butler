// 분쟁 참고자료(DisputeReference)의 임베딩을 계산해 저장한다. 챗봇 RAG 검색에 쓴다.
// seed:disputes 다음에 실행한다. 매번 다시 계산한다(사례집 171건 + 판례 1,152건 + 법령 130건 + 서울시 가이드북 30건 + 상담사례집 211건 + 국토부 사례집 58건, Gemini 무료 티어 기준 약 20분 걸린다).
// 챗봇용 자료(CHATBOT_JSON_PATHS)만 임베딩한다 — 나머지 판례(precedents-all.json에만 있는 것)는 일반 검색에만 쓰고,
// 챗봇·관련 자료는 임베딩이 있는 자료만 읽으므로 여기에 걸리지 않는다.
// 실행: npm run embed:disputes -w apps/api
// 중간에 멈췄으면 임베딩이 없는 자료만 이어서 만든다: npm run embed:disputes -w apps/api -- --missing
import '../src/loadEnv.js';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { CHATBOT_JSON_PATHS } from './disputeSeedFiles.js';
import { EMBEDDING_MODEL, embedPassages } from '../src/domains/disputes/embedder.js';

const prisma = new PrismaClient();
const BATCH_SIZE = 16;
// Gemini 무료 티어 임베딩 한도(분당 100건)를 넘지 않도록 묶음 사이를 띄운다.
const BATCH_DELAY_MS = 10_000;
const MISSING_ONLY = process.argv.includes('--missing');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 분쟁 유형 이름도 같이 넣어서 "수리", "월세 인상"처럼 유형을 가리키는 질문에 걸리게 한다.
const CATEGORY_LABELS = {
  RENT_ADJUSTMENT: '차임·보증금 증감(월세·전세금 인상·감액)',
  LEASE_TERM: '임대차 기간',
  DEPOSIT_RETURN: '보증금·임차목적물 반환',
  REPAIR_DUTY: '유지·수선 의무(고장·하자 수리)',
  CONTRACT_INTERPRETATION: '계약 이행·내용 해석(특약)',
  RENEWAL_TERMINATION: '계약 갱신·종료',
  DAMAGES: '손해배상·원상복구',
  BROKERAGE_FEE: '중개보수·비용 부담',
  PREMIUM: '상가 권리금',
  GENERAL: '분쟁조정 제도 안내',
};

// 본문 전체를 넣으면 사실관계 서술에 핵심이 묻혀서, 제목·요약·키워드·유형만 넣는다.
const toPassage = (reference) =>
  [reference.title, reference.summary, reference.keywords.join(', '), CATEGORY_LABELS[reference.category]].join('\n');

const main = async () => {
  const sourceKeys = CHATBOT_JSON_PATHS.flatMap((jsonPath) =>
    JSON.parse(readFileSync(jsonPath, 'utf-8')).map((row) => row.sourceKey),
  );
  const embedded = MISSING_ONLY ? await prisma.$queryRaw`SELECT id FROM dispute_references WHERE embedding IS NOT NULL` : [];
  const references = await prisma.disputeReference.findMany({
    where: { sourceKey: { in: sourceKeys }, id: { notIn: embedded.map(({ id }) => id) } },
    select: { id: true, title: true, summary: true, keywords: true, category: true },
    orderBy: { sourceKey: 'asc' },
  });

  for (let i = 0; i < references.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_DELAY_MS);
    const batch = references.slice(i, i + BATCH_SIZE);
    const embeddings = await embedPassages(batch.map(toPassage));
    await prisma.$transaction(
      batch.map(
        (reference, j) =>
          prisma.$executeRaw`UPDATE dispute_references SET embedding = ${`[${embeddings[j]}]`}::vector, updated_at = NOW() WHERE id = ${reference.id}::uuid`,
      ),
    );
    console.info(`[embed:disputes] ${Math.min(i + BATCH_SIZE, references.length)}/${references.length}`);
  }

  console.info(`[embed:disputes] DisputeReference ${references.length}건 임베딩 완료 (${EMBEDDING_MODEL}).`);
};

main()
  .catch((error) => {
    console.error('[embed:disputes] 실패:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

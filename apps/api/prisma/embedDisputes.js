// 분쟁 참고자료(DisputeReference)의 임베딩을 계산해 저장한다. 챗봇 RAG 검색에 쓴다.
// seed:disputes 다음에 실행한다. 매번 전체를 다시 계산한다(59건이라 몇 초면 끝난다).
// 실행: npm run embed:disputes -w apps/api
import '../src/loadEnv.js';
import { PrismaClient } from '@prisma/client';
import { EMBEDDING_MODEL, embedPassages } from '../src/domains/disputes/embedder.js';

const prisma = new PrismaClient();
const BATCH_SIZE = 16;

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
  const references = await prisma.disputeReference.findMany({
    select: { id: true, title: true, summary: true, keywords: true, category: true },
    orderBy: { sourceKey: 'asc' },
  });

  for (let i = 0; i < references.length; i += BATCH_SIZE) {
    const batch = references.slice(i, i + BATCH_SIZE);
    const embeddings = await embedPassages(batch.map(toPassage));
    await prisma.$transaction(
      batch.map((reference, j) =>
        prisma.disputeReference.update({ where: { id: reference.id }, data: { embedding: embeddings[j] } }),
      ),
    );
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

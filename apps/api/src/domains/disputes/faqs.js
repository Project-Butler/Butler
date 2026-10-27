// 분쟁 해결사 "자주 묻는 질문". 사람이 쓴 질문·답과 근거 참고자료(sourceKey)를 묶는다.
// 지금은 seed-data JSON을 그대로 읽는다. 나중에 dispute_faqs 테이블로 옮기면 이 파일의
// 읽기 부분만 Prisma 조회로 바꾸면 된다 — 응답 모양(GET /disputes/faqs)은 그대로 둔다.
// 근거는 DB마다 달라지는 id 대신 시드 upsert 키(sourceKey)로 가리킨다.
import faqData from '../../../prisma/seed-data/dispute-faqs.json' with { type: 'json' };
import { findReferenceSummariesBySourceKeys } from './service.js';

export const DISPUTE_FAQS = faqData;

// 참고자료 목록의 q 검색(제목·본문 contains, 대소문자 무시)과 같은 규칙으로 질문·답을 찾는다.
const matchesKeyword = (faq, keyword) => {
  const lower = keyword.toLowerCase();
  return faq.question.toLowerCase().includes(lower) || faq.answer.toLowerCase().includes(lower);
};

// categories가 비어 있으면 전체, keyword가 없으면 거르지 않는다. 순서는 JSON에 적힌 순서(유형 안에서 자주 묻는 순).
export const filterFaqs = ({ categories, keyword }) =>
  DISPUTE_FAQS.filter(
    (faq) => (categories.length === 0 || categories.includes(faq.category)) && (!keyword || matchesKeyword(faq, keyword)),
  );

export const listFaqs = async ({ categories, keyword }) => {
  const faqs = filterFaqs({ categories, keyword });
  const referencesByKey = await findReferenceSummariesBySourceKeys([...new Set(faqs.flatMap((faq) => faq.referenceKeys))]);

  return faqs.map(({ key, category, question, answer, referenceKeys }) => ({
    key,
    category,
    question,
    answer,
    // 시드가 아직 안 된 자료는 빼고 보낸다(질문·답은 그대로 보여 줄 수 있다).
    references: referenceKeys.map((sourceKey) => referencesByKey.get(sourceKey)).filter(Boolean),
  }));
};

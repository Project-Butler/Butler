// 분쟁 해결사 "자주 묻는 질문". 사람이 쓴 질문·답과 근거 참고자료(sourceKey)를 묶는다.
// 지금은 seed-data JSON을 그대로 읽는다. 나중에 dispute_faqs 테이블로 옮기면 이 파일의
// 읽기 부분만 Prisma 조회로 바꾸면 된다 — 응답 모양(GET /disputes/faqs)은 그대로 둔다.
// 근거는 DB마다 달라지는 id 대신 시드 upsert 키(sourceKey)로 가리킨다.
import faqData from '../../../prisma/seed-data/dispute-faqs.json' with { type: 'json' };
import { containsSearchText, findReferenceSummariesBySourceKeys, toSearchTerms, toTermVariants } from './service.js';

export const DISPUTE_FAQS = faqData;

// 참고자료 목록의 q 검색(공백으로 나눈 단어마다 contains, 대소문자 무시, 조사·비용 끝말을 뗀 말·동의어도 인정,
// 단어 경계 규칙, 모든 단어 AND)과 같은 규칙으로 질문·답을 찾는다.
const toFaqText = (faq) => `${faq.question}\n${faq.answer}`.toLowerCase();
const containsTerm = (text, term) => toTermVariants(term).some((variant) => containsSearchText(text, variant));

const matchesKeyword = (faq, keyword) => {
  const text = toFaqText(faq);
  return toSearchTerms(keyword.toLowerCase()).every((term) => containsTerm(text, term));
};

const inCategories = (faq, categories) => categories.length === 0 || categories.includes(faq.category);

// categories가 비어 있으면 전체, keyword가 없으면 거르지 않는다. 순서는 JSON에 적힌 순서(유형 안에서 자주 묻는 순).
export const filterFaqs = ({ categories, keyword }) =>
  DISPUTE_FAQS.filter((faq) => inCategories(faq, categories) && (!keyword || matchesKeyword(faq, keyword)));

// 조건 완화(참고자료 검색 findReferencesByKeyword와 같은 규칙): 모든 단어가 든 질문이 하나도 없으면(유형 필터 전 기준 —
// 유형만 바꿔도 완화되지 않게) 단어가 하나라도 든 질문을 단어 많은 순으로 보여 준다. 같으면 JSON 순서(자주 묻는 순).
// 한 글자 단어는 셀 때 뺀다("안"처럼 어디에나 걸림). 단어가 하나뿐이면 완화하지 않는다.
const MIN_COUNTED_TERM_LENGTH = 2;

// { faqs, partialMatch }. partialMatch는 완화했을 때 { matchedTermCount(가장 많이 든 질문의 단어 수), termCount }, 아니면 null.
export const searchFaqs = ({ categories, keyword }) => {
  const exact = { faqs: filterFaqs({ categories, keyword }), partialMatch: null };
  if (!keyword || DISPUTE_FAQS.some((faq) => matchesKeyword(faq, keyword))) return exact;

  const terms = toSearchTerms(keyword.toLowerCase());
  const countedTerms = terms.filter((term) => term.length >= MIN_COUNTED_TERM_LENGTH);
  if (terms.length < 2 || countedTerms.length === 0) return exact;

  const all = DISPUTE_FAQS.map((faq, index) => {
    const text = toFaqText(faq);
    return { faq, index, matchedTerms: countedTerms.filter((term) => containsTerm(text, term)) };
  });
  // 단어 수가 같으면 드문 단어가 든 질문이 앞(참고자료의 흔한 단어 가중치와 같은 식, 질문 전체에서 센다) —
  // "보증금 곰팡이"면 보증금 질문 여러 개보다 곰팡이 질문이 위.
  const weightByTerm = new Map(
    countedTerms.map((term) => {
      const docCount = all.filter(({ matchedTerms }) => matchedTerms.includes(term)).length;
      return [term, Math.log(1 + (all.length - docCount + 0.5) / (docCount + 0.5))];
    }),
  );
  // 한 단어만 맞은 질문은 그 단어가 검색어에서 가장 드문 말(핵심어)일 때만 보여 준다 — "전세 사기"에 "전세"만 맞은
  // "전세를 월세로 바꾸고 싶어요"처럼 흔한 말 하나로 걸린 질문은 관련이 약하다. "보증금 곰팡이"는 곰팡이 질문만 남는다.
  // 두 단어 이상 맞은 질문은 그대로("월세 연체 내용증명"에 월세·연체가 든 질문).
  const maxWeight = Math.max(...weightByTerm.values());
  const keyTerms = countedTerms.filter((term) => weightByTerm.get(term) === maxWeight);
  const isRelevant = (matchedTerms) =>
    matchedTerms.length >= 2 || (matchedTerms.length === 1 && keyTerms.includes(matchedTerms[0]));
  const counted = all
    .filter(({ faq, matchedTerms }) => isRelevant(matchedTerms) && inCategories(faq, categories))
    .map((entry) => ({
      ...entry,
      matched: entry.matchedTerms.length,
      weight: entry.matchedTerms.reduce((sum, term) => sum + weightByTerm.get(term), 0),
    }));
  if (counted.length === 0) return exact;

  counted.sort((a, b) => b.matched - a.matched || b.weight - a.weight || a.index - b.index);
  return {
    faqs: counted.map(({ faq }) => faq),
    partialMatch: { matchedTermCount: counted[0].matched, termCount: terms.length },
  };
};

// 질문마다 partialMatch를 붙인다(응답은 배열 그대로 — 필드 추가라 기존 화면과 호환).
export const listFaqs = async ({ categories, keyword }) => {
  const { faqs, partialMatch } = searchFaqs({ categories, keyword });
  const referencesByKey = await findReferenceSummariesBySourceKeys([...new Set(faqs.flatMap((faq) => faq.referenceKeys))]);

  return faqs.map(({ key, category, question, answer, referenceKeys }) => ({
    key,
    category,
    question,
    answer,
    // 시드가 아직 안 된 자료는 빼고 보낸다(질문·답은 그대로 보여 줄 수 있다).
    references: referenceKeys.map((sourceKey) => referencesByKey.get(sourceKey)).filter(Boolean),
    partialMatch,
  }));
};

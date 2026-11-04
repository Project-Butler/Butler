// RAG의 "문서 검색" 단계. 질문을 임베딩으로 바꾸고 참고자료 임베딩과의 코사인 유사도로
// 가장 가까운 자료를 고른다. 계산은 DB(pgvector)가 하고 상위 자료만 받아 온다.
import { AppError } from '../../platform/AppError.js';
import { embedQuery } from './embedder.js';
import { findReferencesForRetrieval } from './service.js';

const TOP_K = 5;

// 이어지는 질문("그럼 소송은요?")은 그 자체로는 무엇에 관한 질문인지 알 수 없어서
// 직전 질문을 함께 넣어 검색한다.
const toSearchText = (history, question) => {
  const previousQuestion = history.findLast((message) => message.role === 'USER')?.content;
  return previousQuestion ? `${previousQuestion}\n${question}` : question;
};

// 유사도가 높은 순서로 돌려준다(similarity는 0~1, 클수록 가까움).
export const retrieveReferences = async ({ history, question }) => {
  const queryEmbedding = await embedQuery(toSearchText(history, question));
  const references = await findReferencesForRetrieval(queryEmbedding, TOP_K);

  if (references.length === 0) {
    throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇의 참고자료가 아직 준비되지 않았습니다.');
  }

  return references;
};

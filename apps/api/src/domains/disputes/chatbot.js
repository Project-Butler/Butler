// RAG의 "프롬프트 구성 → 응답 생성" 단계. retriever.js가 고른 참고자료를 근거로 답변을 만든다.
// 답변 모델은 .env의 DISPUTE_CHATBOT_PROVIDER(gemini | claude)로 고른다. 둘 다 돌려주는 모양이
// 같아서({ content, referenceIds, inputTokens, outputTokens }) 바꿔도 API 응답은 그대로다.
import { AppError } from '../../platform/AppError.js';
import { askClaude } from './claudeCounselor.js';
import { askGemini } from './geminiCounselor.js';

const PROVIDERS = { gemini: askGemini, claude: askClaude };

// references: retriever.js가 고른 참고자료(유사도 높은 순)
// history: 이전 메시지 [{ role: 'USER' | 'ASSISTANT', content }] (오래된 순)
export const askCounselor = (params) => {
  const ask = PROVIDERS[process.env.DISPUTE_CHATBOT_PROVIDER || 'gemini'];
  if (!ask) {
    throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇이 아직 설정되지 않았습니다.');
  }
  return ask(params);
};

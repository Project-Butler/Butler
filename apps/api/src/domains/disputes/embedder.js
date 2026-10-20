// 문장을 의미 벡터(임베딩)로 바꾼다. Gemini 임베딩 API를 쓴다 — 로컬 모델(transformers.js)은
// 실행 엔진과 모델이 500MB 넘게 필요해서 Vercel 서버리스 함수에 올릴 수 없었다.
//
// 분쟁 질문 14개 비교(1등 정답 / 상위 5건 안 정답): gemini-embedding-001 13/14 · 14/14,
// 로컬 paraphrase-multilingual-mpnet-base-v2 10/14 · 14/14. 모델이나 차원을 바꾸면
// embed:disputes를 다시 돌려야 한다(질문과 자료가 같은 모델로 만든 벡터여야 비교할 수 있다).
import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../platform/AppError.js';

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const DIMENSIONS = 768;
// 한 번의 요청에 넣는 문장 수
const BATCH_SIZE = 20;

let client = null;

const getClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇이 아직 설정되지 않았습니다.');
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
};

// 3072보다 작은 차원으로 받으면 길이가 1로 맞춰져 있지 않아서 직접 맞춘다.
// 길이가 1이면 두 벡터의 내적이 곧 코사인 유사도다(retriever.js).
const normalize = (vector) => {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
};

// taskType: 검색어는 RETRIEVAL_QUERY, 검색 대상 문서는 RETRIEVAL_DOCUMENT로 만들어야 검색 성능이 나온다.
const embed = async (texts, taskType) => {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    let response;
    try {
      response = await getClient().models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts.slice(i, i + BATCH_SIZE),
        config: { taskType, outputDimensionality: DIMENSIONS },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[disputes/embedder] Gemini 임베딩 호출 실패:', error.status ?? '', error.message);
      throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇이 응답하지 않습니다. 잠시 후 다시 시도해주세요.');
    }
    vectors.push(...response.embeddings.map((embedding) => normalize(embedding.values)));
  }
  return vectors;
};

export const embedQuery = async (text) => (await embed([text], 'RETRIEVAL_QUERY'))[0];

export const embedPassages = (texts) => embed(texts, 'RETRIEVAL_DOCUMENT');

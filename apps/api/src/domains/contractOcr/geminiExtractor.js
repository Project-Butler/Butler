// Created: 2026-11-19
// Gemini로 계약서 글자에서 계약 값을 뽑는다(개발·시험용). 운영은 Claude를 쓴다 — Gemini 무료 티어는 입력이
// 서비스 개선에 쓰일 수 있어 계약서 개인정보에 맞지 않는다. 모델은 분쟁 챗봇과 같은 GEMINI_MODEL을 쓴다.
import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../platform/AppError.js';
import { EXTRACTION_JSON_SCHEMA, EXTRACTION_SYSTEM_PROMPT, toExtractionUserText } from './extractionSchema.js';

const DEFAULT_MODEL = 'gemini-3.5-flash';
const TIMEOUT_MS = 60_000;
// Gemini는 생각(thinking) 토큰도 이 한도에 포함된다.
const MAX_OUTPUT_TOKENS = 16384;

let client = null;

const getClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    console.error('[contractOcr/gemini] GEMINI_API_KEY가 없습니다.');
    throw new AppError('CONTRACT_OCR_UNAVAILABLE', 503, '계약서를 읽지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
};

export const extractWithGemini = async (contractText) => {
  let response;
  try {
    response = await getClient().models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: [{ role: 'user', parts: [{ text: toExtractionUserText(contractText) }] }],
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        responseJsonSchema: EXTRACTION_JSON_SCHEMA,
        httpOptions: { timeout: TIMEOUT_MS },
      },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[contractOcr/gemini] API 호출 실패:', error.status ?? error.name ?? '');
    throw new AppError('CONTRACT_OCR_UNAVAILABLE', 503, '계약서를 읽지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  try {
    return JSON.parse(response.text ?? '');
  } catch {
    console.error('[contractOcr/gemini] JSON 해석 실패:', response.candidates?.[0]?.finishReason ?? '');
    throw new AppError('CONTRACT_OCR_UNREADABLE', 422, '계약서에서 값을 찾지 못했어요. 직접 입력해 주세요.');
  }
};

// Created: 2026-11-19
// 계약 값 추출 모델은 .env의 CONTRACT_OCR_PROVIDER(claude | gemini)로 고른다. 운영은 claude.
// 분쟁 챗봇의 DISPUTE_CHATBOT_PROVIDER와 같은 방식이고, 둘 다 extractionSchema.js 모양의 객체를 돌려준다.
import { AppError } from '../../platform/AppError.js';
import { extractWithClaude } from './claudeExtractor.js';
import { extractWithGemini } from './geminiExtractor.js';

const PROVIDERS = { claude: extractWithClaude, gemini: extractWithGemini };

export const extractContractValues = (contractText) => {
  const extract = PROVIDERS[process.env.CONTRACT_OCR_PROVIDER || 'claude'];
  if (!extract) {
    console.error('[contractOcr] CONTRACT_OCR_PROVIDER 값이 올바르지 않습니다:', process.env.CONTRACT_OCR_PROVIDER);
    throw new AppError('CONTRACT_OCR_UNAVAILABLE', 503, '계약서를 읽지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  return extract(contractText);
};

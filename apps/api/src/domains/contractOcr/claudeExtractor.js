// Created: 2026-11-19
// Claude로 계약서 글자에서 계약 값을 뽑는다. 응답 모양은 structured outputs(json_schema)로 고정한다.
// 모델은 CONTRACT_OCR_CLAUDE_MODEL(기본 claude-sonnet-5-5). Claude는 이미지가 아니라 CLOVA가 읽은 글자만 받는다.
import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../../platform/AppError.js';
import { EXTRACTION_JSON_SCHEMA, EXTRACTION_SYSTEM_PROMPT, toExtractionUserText } from './extractionSchema.js';

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 16000;
// Haiku에는 서버 쪽 대체 모델(fallbacks)이 없어서 보내면 400이 난다.
const supportsServerFallback = (model) => !model.startsWith('claude-haiku');

let client = null;

const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[contractOcr/claude] ANTHROPIC_API_KEY가 없습니다.');
    throw new AppError('CONTRACT_OCR_UNAVAILABLE', 503, '계약서를 읽지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  client ??= new Anthropic();
  return client;
};

export const extractWithClaude = async (contractText) => {
  const model = process.env.CONTRACT_OCR_CLAUDE_MODEL || DEFAULT_MODEL;
  let response;
  try {
    response = await getClient().beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: EXTRACTION_JSON_SCHEMA } },
      // 안전 분류기가 거절하면 서버가 다른 모델로 다시 시도한다.
      ...(supportsServerFallback(model) && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: toExtractionUserText(contractText) }],
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[contractOcr/claude] API 호출 실패:', error.status ?? '', error.name);
    throw new AppError('CONTRACT_OCR_UNAVAILABLE', 503, '계약서를 읽지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    console.error('[contractOcr/claude] 응답이 끝나지 않음:', response.stop_reason);
    throw new AppError('CONTRACT_OCR_UNREADABLE', 422, '계약서에서 값을 찾지 못했어요. 직접 입력해 주세요.');
  }

  const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    console.error('[contractOcr/claude] JSON 해석 실패');
    throw new AppError('CONTRACT_OCR_UNREADABLE', 422, '계약서에서 값을 찾지 못했어요. 직접 입력해 주세요.');
  }
};

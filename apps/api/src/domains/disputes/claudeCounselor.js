// Claude로 답변을 만든다. 참고자료를 citations가 켜진 document 블록으로 넣고, 답변 문장이
// 어느 자료에서 왔는지(document_index)를 받아 referenceIds로 바꾼다.
import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../../platform/AppError.js';
import { BASE_SYSTEM_PROMPT, toReferenceBody, toReferenceContext } from './counselorPrompt.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const MAX_TOKENS = 8000;

let client = null;

const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇이 아직 설정되지 않았습니다.');
  }
  client ??= new Anthropic();
  return client;
};

// context는 모델이 읽기만 하고 인용 대상은 아니라서 분류 정보를 여기에 둔다.
const toDocumentBlock = (reference) => ({
  type: 'document',
  source: { type: 'text', media_type: 'text/plain', data: toReferenceBody(reference) },
  title: reference.title,
  context: toReferenceContext(reference),
  citations: { enabled: true },
});

// 검색된 자료는 이번 질문 바로 앞에 둔다. 이전 질문 때 검색된 자료는 이전 답변 본문에만 남고
// 다시 보내지 않는다 — 질문마다 그 질문에 맞는 자료 몇 건만 보내서 입력 토큰을 줄인다.
const buildMessages = (references, history, question) => [
  ...history.map(({ role, content }) => ({ role: role.toLowerCase(), content })),
  { role: 'user', content: [...references.map(toDocumentBlock), { type: 'text', text: question }] },
];

// 인용이 붙은 text 블록 뒤에 [1], [2]를 붙인다. 번호는 referenceIds에서의 순서(1부터)다.
const toAnswer = (content, references) => {
  const referenceIds = [];
  let text = '';

  for (const block of content) {
    if (block.type !== 'text') continue;
    text += block.text;

    const markers = new Set();
    for (const citation of block.citations ?? []) {
      const reference = references[citation.document_index];
      if (!reference) continue;
      if (!referenceIds.includes(reference.id)) referenceIds.push(reference.id);
      markers.add(referenceIds.indexOf(reference.id) + 1);
    }
    text += [...markers].map((n) => `[${n}]`).join('');
  }

  return { content: text.trim(), referenceIds };
};

export const askClaude = async ({ references, history, question }) => {
  let response;
  try {
    response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'medium' },
      // 안전 분류기가 거절하면 서버가 다른 모델로 다시 시도한다.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: BASE_SYSTEM_PROMPT,
      messages: buildMessages(references, history, question),
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[disputes/claude] API 호출 실패:', error.status ?? '', error.message);
    throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇이 응답하지 않습니다. 잠시 후 다시 시도해주세요.');
  }

  if (response.stop_reason === 'refusal') {
    throw new AppError('DISPUTE_CHAT_REFUSED', 422, '이 질문에는 답변할 수 없습니다. 질문을 바꿔서 다시 시도해주세요.');
  }

  const answer = toAnswer(response.content, references);
  if (!answer.content) {
    throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇이 답변을 만들지 못했습니다. 다시 시도해주세요.');
  }

  return { ...answer, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
};

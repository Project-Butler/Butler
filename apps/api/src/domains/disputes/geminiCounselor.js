// Gemini로 답변을 만든다. Gemini에는 Claude의 citations 같은 기능이 없어서, 자료에 [1]~[N]
// 번호를 붙여 주고 답변에 적힌 번호를 읽어 referenceIds로 바꾼다.
import { ApiError, GoogleGenAI } from '@google/genai';
import { AppError } from '../../platform/AppError.js';
import { BASE_SYSTEM_PROMPT, toReferenceBody, toReferenceContext } from './counselorPrompt.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
// Gemini는 생각(thinking) 토큰도 이 한도에 포함된다.
const MAX_OUTPUT_TOKENS = 8192;

const SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}
- 참고자료는 [1], [2]처럼 번호가 붙어 있습니다. 자료를 근거로 쓴 문장 끝에는 그 번호를 [1]처럼 대괄호로 적습니다. 여러 자료면 [1][3]처럼 이어 적고, 주어진 번호만 씁니다.`;

let client = null;

const getClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇이 아직 설정되지 않았습니다.');
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
};

const toReferenceText = (reference, i) =>
  `[${i + 1}] ${reference.title}\n${toReferenceContext(reference)}\n\n${toReferenceBody(reference)}`;

// 검색된 자료는 이번 질문 바로 앞에 둔다(claudeCounselor.js와 같은 이유). 이전 답변의 [번호]는
// 그때 검색된 자료 번호라서 이번 자료 번호와 헷갈리지 않게 지우고 보낸다.
const buildContents = (references, history, question) => [
  ...history.map(({ role, content }) =>
    role === 'USER'
      ? { role: 'user', parts: [{ text: content }] }
      : { role: 'model', parts: [{ text: content.replace(/\[\d+\]/g, '') }] },
  ),
  {
    role: 'user',
    parts: [{ text: `## 참고자료\n\n${references.map(toReferenceText).join('\n\n---\n\n')}\n\n## 질문\n\n${question}` }],
  },
];

// 모델이 붙인 번호(검색 순서)를 처음 인용한 순서대로 1부터 다시 매긴다 — 화면의 [1]이
// referenceIds[0]을 가리키게 하기 위해서다. [1, 3]처럼 적어도 받아 주고, 없는 번호는 지운다.
const toAnswer = (text, references) => {
  const referenceIds = [];

  const content = text.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_match, numbers) =>
    numbers
      .split(',')
      .map((number) => references[Number(number) - 1])
      .filter(Boolean)
      .map((reference) => {
        if (!referenceIds.includes(reference.id)) referenceIds.push(reference.id);
        return `[${referenceIds.indexOf(reference.id) + 1}]`;
      })
      .join(''),
  );

  return { content: content.trim(), referenceIds };
};

export const askGemini = async ({ references, history, question }) => {
  let response;
  try {
    response = await getClient().models.generateContent({
      model: MODEL,
      contents: buildContents(references, history, question),
      config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: MAX_OUTPUT_TOKENS },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[disputes/gemini] API 호출 실패:', error.status ?? '', error.message);
    if (error instanceof ApiError && error.status === 429) {
      throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇 사용량이 많습니다. 잠시 후 다시 시도해주세요.');
    }
    throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇이 응답하지 않습니다. 잠시 후 다시 시도해주세요.');
  }

  if (response.promptFeedback?.blockReason || response.candidates?.[0]?.finishReason === 'SAFETY') {
    throw new AppError('DISPUTE_CHAT_REFUSED', 422, '이 질문에는 답변할 수 없습니다. 질문을 바꿔서 다시 시도해주세요.');
  }

  const answer = toAnswer(response.text ?? '', references);
  if (!answer.content) {
    throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, '상담 챗봇이 답변을 만들지 못했습니다. 다시 시도해주세요.');
  }

  const usage = response.usageMetadata ?? {};
  return {
    ...answer,
    inputTokens: usage.promptTokenCount ?? null,
    outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) || null,
  };
};

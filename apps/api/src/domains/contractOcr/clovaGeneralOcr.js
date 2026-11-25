// Created: 2026-11-19
// 네이버 CLOVA OCR General(일반 OCR) 호출. 임대차계약서는 양식이 정해져 있지 않아 템플릿 OCR 대신 General을 쓴다.
// 환경 변수: CLOVA_GENERAL_OCR_INVOKE_URL(API Gateway 호출 주소), CLOVA_GENERAL_OCR_SECRET(X-OCR-SECRET 헤더)
// 요청·응답 형식은 V2(네이버 클라우드 API 문서 "General OCR"). PDF는 CLOVA가 최대 10쪽까지 읽는다.
import { randomUUID } from 'node:crypto';
import { AppError } from '../../platform/AppError.js';

const TIMEOUT_MS = 60_000;

const throwUnavailable = () => {
  throw new AppError('CONTRACT_OCR_UNAVAILABLE', 503, '계약서를 읽지 못했어요. 잠시 후 다시 시도해 주세요.');
};

// fields를 읽은 순서대로 이어 붙인다. lineBreak가 true면 그 글자 뒤에서 줄을 바꾼다.
const toPlainText = (fields = []) =>
  fields.map((field) => `${field.inferText ?? ''}${field.lineBreak ? '\n' : ' '}`).join('').trim();

// 오류 응답의 코드·메시지만 꺼낸다(예: "0002 Secret validate failed"). 계약서 내용은 없어 로그에 남겨도 된다.
// OCR 오류는 { code, message }, API Gateway 오류(주소 틀림 등)는 { error: { errorCode, message } } 형식이다.
// path(도메인 주소)는 남기지 않는다. 본문을 읽지 못하면 빈 문자열.
const readErrorCode = async (res) => {
  try {
    const body = await res.json();
    const code = body?.code ?? body?.error?.errorCode ?? '';
    const message = body?.message ?? body?.error?.message ?? '';
    return `${code} ${String(message).slice(0, 100)}`.trim();
  } catch {
    return '';
  }
};

// file: Buffer, format: 'jpg' | 'png' | 'pdf'
// → { text: 읽은 글자 전체(여러 쪽이면 쪽마다 빈 줄로 나눔), pageCount: CLOVA가 받은 쪽 수 }
// 설정이 없거나 CLOVA가 응답하지 않으면 503. 원문·응답 본문은 개인정보라 로그에 남기지 않는다.
export const readContractText = async ({ file, format }) => {
  const url = process.env.CLOVA_GENERAL_OCR_INVOKE_URL;
  const secret = process.env.CLOVA_GENERAL_OCR_SECRET;
  if (!url || !secret) {
    console.error('[contractOcr/clova] CLOVA_GENERAL_OCR_INVOKE_URL·CLOVA_GENERAL_OCR_SECRET이 없습니다.');
    throwUnavailable();
  }

  let body;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OCR-SECRET': secret },
      body: JSON.stringify({
        version: 'V2',
        requestId: randomUUID(),
        timestamp: Date.now(),
        lang: 'ko',
        images: [{ format, name: 'contract', data: file.toString('base64') }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error('[contractOcr/clova] HTTP 오류:', res.status, await readErrorCode(res));
      throwUnavailable();
    }
    body = await res.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[contractOcr/clova] 호출 실패:', error.name);
    throwUnavailable();
  }

  // 여러 쪽 PDF는 쪽마다 images 하나씩 쪽 순서대로 온다(2026-11-19 10쪽 PDF로 확인). 읽은 쪽을 이어 붙인다.
  // pageCount는 CLOVA가 받은 쪽 수(쪽마다 1건 과금)라 읽기에 실패한 쪽도 센다.
  const images = body?.images ?? [];
  const pages = images.filter((image) => image.inferResult === 'SUCCESS').map((image) => toPlainText(image.fields));
  return { text: pages.filter(Boolean).join('\n\n'), pageCount: images.length };
};

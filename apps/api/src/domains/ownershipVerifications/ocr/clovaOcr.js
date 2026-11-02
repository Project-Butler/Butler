// Created: 2026-11-02
// 네이버 CLOVA OCR 템플릿 OCR(Template OCR) 호출. 요청 형식은 V2.
// 환경 변수: CLOVA_OCR_INVOKE_URL(API Gateway 호출 주소), CLOVA_OCR_SECRET(X-OCR-SECRET 헤더)
import { randomUUID } from 'node:crypto';

const TIMEOUT_MS = 60_000;

// PNG 1장을 템플릿 1개로 인식 → CLOVA 응답의 images[0]
//   { inferResult: 'SUCCESS'|'FAILURE'|'ERROR', message, matchedTemplate: { id, name }, fields: [{ name, inferText, inferConfidence, … }] }
// HTTP 오류·인식 실패는 throw 한다.
export const requestTemplateOcr = async ({ png, templateId, name = 'ledger' }) => {
  const url = process.env.CLOVA_OCR_INVOKE_URL;
  const secret = process.env.CLOVA_OCR_SECRET;
  if (!url || !secret) throw new Error('apps/api/.env 에 CLOVA_OCR_INVOKE_URL·CLOVA_OCR_SECRET 을 넣어 주세요.');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OCR-SECRET': secret },
    body: JSON.stringify({
      version: 'V2',
      requestId: randomUUID(),
      timestamp: Date.now(),
      lang: 'ko',
      images: [{ format: 'png', name, data: png.toString('base64'), templateIds: [templateId] }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CLOVA OCR HTTP ${res.status}: ${text.slice(0, 300)}`);

  const image = JSON.parse(text)?.images?.[0];
  if (!image) throw new Error('CLOVA OCR 응답에 images가 없습니다.');
  if (image.inferResult !== 'SUCCESS') throw new Error(`CLOVA OCR 인식 실패(${image.inferResult}): ${image.message ?? ''}`);
  return image;
};

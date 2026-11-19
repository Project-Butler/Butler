// Created: 2026-11-19
// 요청 형식 검사만 본다(서비스까지 가기 전에 거절되는 경우). OCR·LLM 호출은 하지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countPdfPages, postContractOcr } from '../../../src/domains/contractOcr/controller.js';

const OWNERSHIP_ID = '11111111-1111-4111-8111-111111111111';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const pdfWithPages = (pages) =>
  Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Pages /Count ${pages} >>\n${'2 0 obj << /Type /Page >>\n'.repeat(pages)}%%EOF`, 'latin1');

const call = async ({ query = { ownershipId: OWNERSHIP_ID }, contentType, body }) => {
  const req = { query, body, user: { id: 'u1' }, get: (name) => (name === 'Content-Type' ? contentType : undefined) };
  let received;
  await postContractOcr(req, { status: () => ({ json: () => {} }) }, (error) => {
    received = error;
  });
  return received;
};

test('ownershipId가 UUID가 아니면 400', async () => {
  const error = await call({ query: { ownershipId: 'x' }, contentType: 'image/jpeg', body: JPEG });
  assert.equal(error.code, 'VALIDATION_ERROR');
});

test('허용하지 않는 형식·내용이 형식과 다른 파일은 422', async () => {
  assert.equal((await call({ contentType: 'image/gif', body: JPEG })).code, 'CONTRACT_OCR_UNSUPPORTED_FILE');
  assert.equal((await call({ contentType: 'image/png', body: JPEG })).code, 'CONTRACT_OCR_UNSUPPORTED_FILE');
  assert.equal((await call({ contentType: 'application/pdf', body: PNG })).code, 'CONTRACT_OCR_UNSUPPORTED_FILE');
});

test('빈 본문은 400', async () => {
  assert.equal((await call({ contentType: 'image/jpeg', body: Buffer.alloc(0) })).code, 'CONTRACT_OCR_FILE_REQUIRED');
});

test('PDF는 5쪽까지', async () => {
  assert.equal(countPdfPages(pdfWithPages(5)), 5);
  assert.equal((await call({ contentType: 'application/pdf', body: pdfWithPages(6) })).code, 'CONTRACT_OCR_TOO_MANY_PAGES');
});

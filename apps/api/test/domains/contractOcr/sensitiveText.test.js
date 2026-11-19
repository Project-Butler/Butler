// Created: 2026-11-19
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { removeSensitiveText } from '../../../src/domains/contractOcr/sensitiveText.js';

test('주민등록번호(하이픈·공백·가림 표기)를 지운다', () => {
  for (const rrn of ['900101-1234567', '900101 - 2234567', '9 0 0 1 0 1-1 2 3 4 5 6 7', '900101-1******', '9001011234567']) {
    const result = removeSensitiveText(`임차인 주민등록번호 ${rrn} 주소`);
    assert.ok(!/\d{6}/.test(result.replace(/\s/g, '')), `${rrn} → ${result}`);
    assert.match(result, /\[주민등록번호 삭제\]/);
  }
});

test('전화번호·금액·날짜는 그대로 둔다', () => {
  const text = '전화 010-1234-5678 보증금 ₩120,000,000 2026년 3월 1일 01012345678';
  assert.equal(removeSensitiveText(text), text);
});

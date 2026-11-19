// Created: 2026-11-19
// 계약서 OCR 글자에서 LLM에 보내면 안 되는 민감정보를 지운다(B팀 계약서 OCR, #168).
// 지금은 주민등록번호·외국인등록번호(앞 6자리-뒤 7자리)만 지운다. 계약 값 추출에는 필요 없는 정보다.

const MASK = '[주민등록번호 삭제]';

// OCR은 숫자 사이에 공백을 넣기도 해서 공백을 허용한다. 뒷자리는 일부가 *로 가려진 경우도 있다.
// 하이픈이 있는 형태: 900101-1234567, 900101 - 1******, 9 0 0 1 0 1-1 2 3 4 5 6 7
const RRN_WITH_DASH = /(?<!\d)(?:\d\s*){5}\d\s*[-–—]\s*[1-8*](?:\s*[\d*]){6}(?![\d*])/g;
// 하이픈 없이 13자리가 붙은 형태. 전화번호(10~11자리)·계좌번호와 섞이지 않게 정확히 13자리만 본다.
const RRN_DIGITS_ONLY = /(?<!\d)\d{6}[1-8]\d{6}(?!\d)/g;

export const removeSensitiveText = (text) => text.replace(RRN_WITH_DASH, MASK).replace(RRN_DIGITS_ONLY, MASK);

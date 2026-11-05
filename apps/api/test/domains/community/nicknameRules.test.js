// 닉네임 규칙(DB 없음) — 길이 · 글자 · 공백 · 금지 낱말 · 비교 키 · 바꾸기 주기.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  checkNickname,
  cleanNickname,
  NICKNAME_CHANGE_INTERVAL_DAYS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  nextNicknameChangeAt,
  toNicknameKey,
} from '../../../src/domains/community/nicknameRules.js';

describe('닉네임 형식', () => {
  test('2~12자 — 공백도 한 글자로 센다', () => {
    assert.deepEqual([NICKNAME_MIN_LENGTH, NICKNAME_MAX_LENGTH], [2, 12]);
    assert.equal(checkNickname('가'), 'LENGTH');
    assert.equal(checkNickname('부자'), null);
    assert.equal(checkNickname('가나다라마바사아자차카타'), null); // 12자
    assert.equal(checkNickname('가나다라마바사아자차카타파'), 'LENGTH'); // 13자
    assert.equal(checkNickname('가나다라마 바사아자차카'), null); // 공백 포함 12자
  });

  test('한글(완성형) · 영문 · 숫자, 가운데 공백 하나까지', () => {
    for (const ok of ['삼전동 부자', 'Rich Kim', '임대인2024', 'abc']) assert.equal(checkNickname(ok), null, ok);
    for (const bad of ['삼전동  부자', '삼 전 동', '부자!', 'ㅋㅋㅋ', '부자_임대인', '부자\t임대인']) assert.equal(checkNickname(bad), 'FORMAT', bad);
  });

  test('앞뒤 공백은 떼고 본다 · 유니코드 정규화(NFC)', () => {
    assert.equal(cleanNickname('  삼전동 부자 '), '삼전동 부자');
    // 자모로 풀어 쓴 "가" 도 완성형 "가" 와 같게
    assert.equal(cleanNickname('가나'), '가나');
  });

  test('금지 낱말이 들어가면 탈락 — 영문 대소문자 · 띄어쓰기 무시', () => {
    for (const bad of ['운영자', '버틀러팬', '관리자 김씨', 'Butler', 'super ADMIN', '운영 자', '공식계정']) {
      assert.equal(checkNickname(bad), 'BANNED', bad);
    }
    assert.equal(checkNickname('관리비 걱정'), null); // "관리자" 가 아니다
  });
});

describe('비교 키 · 바꾸기 주기', () => {
  test('영문 소문자 · 띄어쓰기 없음 — "Rich Kim" = "richkim"', () => {
    assert.equal(toNicknameKey('Rich Kim'), 'richkim');
    assert.equal(toNicknameKey('삼전동 부자'), toNicknameKey('삼전동부자'));
  });

  test('바꾼 적이 없으면(처음 정한 것만) 지금 바꿀 수 있고, 바꿨으면 30일 뒤', () => {
    assert.equal(NICKNAME_CHANGE_INTERVAL_DAYS, 30);
    assert.equal(nextNicknameChangeAt(null), null);
    assert.equal(nextNicknameChangeAt(new Date('2026-11-05T00:00:00Z')).toISOString(), '2026-12-05T00:00:00.000Z');
  });
});

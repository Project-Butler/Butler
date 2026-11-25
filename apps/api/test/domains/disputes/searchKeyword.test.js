import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanSearchKeyword, toSearchTerms, toTermVariants } from '../../../src/domains/disputes/service.js';

test('검색어 문장부호: 물음표·괄호·따옴표·마침표 등은 공백으로 바꾼다', () => {
  assert.equal(cleanSearchKeyword('보증금?'), '보증금');
  assert.equal(cleanSearchKeyword('보증금.'), '보증금');
  assert.equal(cleanSearchKeyword('(보증금)'), '보증금');
  assert.equal(cleanSearchKeyword('"보증금"'), '보증금');
  assert.equal(cleanSearchKeyword('보증금*'), '보증금');
  assert.equal(cleanSearchKeyword('「주택임대차보호법」'), '주택임대차보호법');
  assert.equal(cleanSearchKeyword('보증금을 안 돌려줘요!!'), '보증금을 안 돌려줘요');
  assert.equal(cleanSearchKeyword('누수, 곰팡이'), '누수 곰팡이');
  assert.equal(cleanSearchKeyword('보증금;DROP TABLE x'), '보증금 DROP TABLE x');
});

test('검색어 문장부호: 자료에서 뜻이 있는 부호는 남긴다', () => {
  assert.equal(cleanSearchKeyword('증액 5%'), '증액 5%');
  assert.equal(cleanSearchKeyword('2.5% 인상'), '2.5% 인상');
  assert.equal(cleanSearchKeyword('1,000만 원'), '1,000만 원');
  assert.equal(cleanSearchKeyword('도배·장판'), '도배·장판');
  assert.equal(cleanSearchKeyword('2020다226452'), '2020다226452');
  assert.equal(cleanSearchKeyword('제6조의3'), '제6조의3');
});

test('검색어 문장부호: 부호만 있으면 원래 검색어 그대로(전체 목록이 나오지 않게)', () => {
  assert.equal(cleanSearchKeyword('???'), '???');
  assert.equal(cleanSearchKeyword('#$@!'), '#$@!');
});

test('영문 약칭은 대소문자 없이 정식 이름으로도 찾는다', () => {
  for (const word of ['HUG', 'hug', 'Hug']) assert.ok(toTermVariants(word).includes('주택도시보증공사'), word);
  assert.ok(toTermVariants('LH').includes('한국토지주택공사'));
});

test('자료에 없는 새말은 자료에 쓰인 관련 말로 찾는다', () => {
  assert.ok(toTermVariants('깡통전세').includes('반환보증'));
  assert.ok(toTermVariants('깡통전세').includes('보증보험'));
  // 조사를 붙여도("깡통전세를") 같은 말로 찾는다
  assert.ok(toTermVariants('깡통전세를').includes('보증보험'));
});

test('붙임말 나눠 찾기: 전세사기는 보증금·사기 두 단어 모두(사기는 기망으로도)', () => {
  assert.deepEqual(toSearchTerms('전세사기'), ['보증금', '사기']);
  assert.deepEqual(toSearchTerms('전세사기 보증금'), ['보증금', '사기']);
  assert.ok(toTermVariants('사기').includes('기망'));
});

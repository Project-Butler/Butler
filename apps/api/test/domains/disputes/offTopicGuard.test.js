import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MIN_RELEVANT_SIMILARITY,
  OFF_TOPIC_MESSAGE,
  isOffTopic,
  offTopicAnswer,
  withoutOffTopicTurns,
} from '../../../src/domains/disputes/offTopicGuard.js';

const references = (...similarities) => similarities.map((similarity, i) => ({ id: `r${i}`, similarity }));

test('관계없는 질문: 1등 자료 유사도가 기준보다 낮으면 거른다', () => {
  // "오늘 저녁 메뉴 추천해 줘"를 잰 값(1등 0.608)
  assert.equal(isOffTopic(references(0.608, 0.605, 0.603)), true);
});

test('관계없는 질문: 1등 자료 유사도가 기준 이상이면 답변 모델로 보낸다', () => {
  // 측정한 임대차 질문 중 가장 낮았던 "확정일자가 뭐예요?"(0.692)
  assert.equal(isOffTopic(references(0.692, 0.68)), false);
  assert.equal(isOffTopic(references(MIN_RELEVANT_SIMILARITY)), false);
});

test('관계없는 질문: 검색 결과가 없으면 거른다', () => {
  assert.equal(isOffTopic([]), true);
});

test('관계없는 질문: 안내 답변은 답변 모델과 같은 모양이고 근거 자료와 토큰 수가 없다', () => {
  assert.deepEqual(offTopicAnswer(), {
    content: OFF_TOPIC_MESSAGE,
    referenceIds: [],
    inputTokens: null,
    outputTokens: null,
  });
});

test('관계없는 질문: 걸러진 질문과 안내 답변은 대화 기록에서 빼고 나머지 순서는 지킨다', () => {
  const history = [
    { role: 'USER', content: '월세가 3개월 밀렸어요' },
    { role: 'ASSISTANT', content: '해지할 수 있습니다 [1]' },
    { role: 'USER', content: '강남역 맛집 알려줘' },
    { role: 'ASSISTANT', content: OFF_TOPIC_MESSAGE },
    { role: 'USER', content: '그럼 소송은요?' },
    { role: 'ASSISTANT', content: '명도 소송을 낼 수 있습니다 [2]' },
  ];

  assert.deepEqual(
    withoutOffTopicTurns(history).map(({ content }) => content),
    ['월세가 3개월 밀렸어요', '해지할 수 있습니다 [1]', '그럼 소송은요?', '명도 소송을 낼 수 있습니다 [2]'],
  );
  assert.deepEqual(withoutOffTopicTurns([]), []);
});

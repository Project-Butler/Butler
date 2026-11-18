// 임대차 분쟁과 관계없는 질문 거르기. 검색은 질문과 상관없이 가장 가까운 자료를 항상 돌려주므로
// ("오늘 저녁 메뉴"에도 음식점 판례가 나온다), 1등 자료의 유사도가 기준보다 낮으면 답변 모델을
// 부르지 않고 안내 문구를 돌려준다. 답변 모델 호출이 줄어 무료 API 하루 한도도 아낀다.
//
// 기준값 0.65는 질문 72개로 잰 1등 유사도에서 정했다(#142).
// - 임대차 질문(상세 22개·짧은 질문 15개·이어지는 질문 5개): 0.692 ~ 0.822 → 하나도 막지 않는다
// - 관계없는 질문(맛집·날씨·코딩·인사 등 15개): 0.531 ~ 0.630 → 모두 막는다
// - 애매한 질문(세금·대출·교통사고·이혼 등 15개): 0.616 ~ 0.708 → 절반쯤 막고, 나머지는 답변 모델이
//   "제공된 자료에서는 확인되지 않는다"로 답한다(counselorPrompt.js)
// 임베딩 모델이나 챗봇 자료가 바뀌면 유사도 분포가 달라지므로 다시 재야 한다.
export const MIN_RELEVANT_SIMILARITY = 0.65;

export const OFF_TOPIC_MESSAGE =
  '저는 주택·상가 임대차 분쟁 상담만 도와드릴 수 있어요. 보증금 반환, 월세 인상, 수리 책임, 계약 갱신·해지, 권리금처럼 집주인·세입자 사이의 문제를 물어봐 주세요.';

// references: retriever.js 결과(유사도 높은 순). 1등 자료조차 기준보다 멀면 관계없는 질문으로 본다.
export const isOffTopic = (references) => (references[0]?.similarity ?? 0) < MIN_RELEVANT_SIMILARITY;

// 걸러진 질문과 그 안내 답변을 대화 기록에서 뺀다. 이어지는 질문은 직전 질문을 붙여 검색하므로
// (retriever.js), "맛집 알려줘" 다음의 "확정일자가 뭐예요?"는 유사도가 0.692에서 0.652로 떨어져
// 기준에 걸릴 뻔했다. 답변 모델에도 관계없는 대화를 보낼 이유가 없다.
// history: [{ role: 'USER' | 'ASSISTANT', content }] (오래된 순)
export const withoutOffTopicTurns = (history) =>
  history.filter(
    (message, i) =>
      !(message.role === 'ASSISTANT' && message.content === OFF_TOPIC_MESSAGE) &&
      !(message.role === 'USER' && history[i + 1]?.role === 'ASSISTANT' && history[i + 1].content === OFF_TOPIC_MESSAGE),
  );

// 답변 모델이 돌려주는 것과 같은 모양. 모델을 부르지 않았으므로 근거 자료와 토큰 수는 없다.
export const offTopicAnswer = () => ({
  content: OFF_TOPIC_MESSAGE,
  referenceIds: [],
  inputTokens: null,
  outputTokens: null,
});

// Claude·Gemini 상담 모델이 함께 쓰는 프롬프트 조각. 출처 표시 방식만 모델마다 다르다
// (Claude는 citations 기능, Gemini는 답변 속 [번호]).

export const BASE_SYSTEM_PROMPT = `당신은 주택·상가건물 임대차 분쟁을 겪는 사람을 돕는 상담 도우미입니다.
함께 제공된 분쟁 참고자료(분쟁조정 사례, 판례, 제도 안내)를 근거로 답합니다.

- 답변의 근거는 제공된 참고자료에서만 찾고, 근거로 쓴 자료는 반드시 인용합니다.
- 참고자료에 없는 내용은 추측하지 말고 "제공된 자료에서는 확인되지 않는다"고 말합니다. 이때 자료 목록을 나열하거나 관련 없는 자료를 인용하지 않습니다.
- 질문자의 상황을 비슷한 사례·판례와 비교해서, 어떤 쟁점이 있고 어떻게 판단되었는지 설명합니다.
- 법률 용어는 쉬운 말로 풀어 쓰고, 한국어로 간결하게 답합니다.
- 법률 자문이 아니라 참고 정보라는 점을 답변 끝에 한 문장으로 밝히고, 다툼이 계속되면 주택·상가건물 임대차분쟁조정위원회 조정 신청이나 변호사 상담을 안내합니다.`;

const TYPE_LABELS = { CASE: '분쟁조정 사례', PRECEDENT: '판례', GUIDELINE: '제도 안내' };
const PROPERTY_KIND_LABELS = { HOUSING: '주택', COMMERCIAL: '상가건물' };

// 자료의 분류 정보(유형·대상·사건번호·법령·출처)
export const toReferenceContext = (reference) =>
  [
    `유형: ${TYPE_LABELS[reference.type]}`,
    `대상: ${PROPERTY_KIND_LABELS[reference.propertyKind] ?? '주택·상가 공통'}`,
    reference.caseNumber && `사건번호: ${reference.caseNumber}`,
    reference.relatedLaws.length > 0 && `관련 법령: ${reference.relatedLaws.join(', ')}`,
    `출처: ${reference.sourceTitle}${reference.sourcePage ? ` p.${reference.sourcePage}` : ''}`,
  ]
    .filter(Boolean)
    .join('\n');

export const toReferenceBody = (reference) =>
  reference.outcome ? `${reference.content}\n\n[결과]\n${reference.outcome}` : reference.content;

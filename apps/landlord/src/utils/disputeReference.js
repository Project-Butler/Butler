// 분쟁 참고자료 화면 표기. 값은 API enum(DisputeReferenceType, DisputeCategory)과 같다.

export const REFERENCE_TYPES = [
  { value: 'CASE', label: '사례' },
  { value: 'PRECEDENT', label: '판례' },
  { value: 'GUIDELINE', label: '가이드라인' },
];

export const TYPE_LABELS = Object.fromEntries(REFERENCE_TYPES.map(({ value, label }) => [value, label]));

export const CATEGORY_LABELS = {
  RENT_ADJUSTMENT: '월세·보증금 조정',
  LEASE_TERM: '임대차 기간',
  DEPOSIT_RETURN: '보증금 반환',
  REPAIR_DUTY: '수리 책임',
  CONTRACT_INTERPRETATION: '계약 내용 해석',
  RENEWAL_TERMINATION: '계약 갱신·종료',
  DAMAGES: '손해배상',
  BROKERAGE_FEE: '중개보수',
  PREMIUM: '권리금',
  GENERAL: '제도 안내',
};

// 분쟁 해결사 첫 화면 상황 타일이자 목록의 칩. 화면 묶음이라 DB 분쟁 유형(category) 여러 개를 하나로 묶기도 한다.
// 시안의 '원상복구'는 손해배상, '월세 인상'은 월세·보증금 조정, '중도 해지'는 계약 갱신·종료에 들어간다.
export const DISPUTE_TOPICS = [
  { key: 'deposit', label: '보증금 반환', categories: ['DEPOSIT_RETURN'] },
  { key: 'restore', label: '원상복구·손해배상', categories: ['DAMAGES'] },
  { key: 'repair', label: '수리 책임', categories: ['REPAIR_DUTY'] },
  { key: 'renewal', label: '계약 갱신·종료', categories: ['RENEWAL_TERMINATION', 'LEASE_TERM'] },
  { key: 'rent', label: '월세·보증금 조정', categories: ['RENT_ADJUSTMENT'] },
  { key: 'other', label: '기타·제도 안내', categories: ['GENERAL', 'CONTRACT_INTERPRETATION', 'BROKERAGE_FEE', 'PREMIUM'] },
];

export const findTopic = (key) => DISPUTE_TOPICS.find((topic) => topic.key === key) ?? null;

// 조정사례 본문은 "[사실관계] … [임대인 주장] … [쟁점] … [검토] …"처럼 구간 제목이 붙어 있다.
// 구간마다 카드로 나눠 보여 주고, 구간 제목이 없는 본문(판례·가이드라인)은 한 덩어리로 둔다.
// 국가법령정보센터 판례 원문에는 "[다수의견]", "[별표 1]" 같은 대괄호가 있어서 사례집 구간 제목만 나눈다.
const SECTION_MARKER = /\[(사실관계|쟁점|검토|[^\]\n]{0,6}주장)\]/;
const SECTION_TITLE_ALIASES = { 사실관계: '상황' };
const DEFAULT_SECTION_TITLE = { CASE: '상황', PRECEDENT: '판시 내용', GUIDELINE: '안내' };

// 사례집 판례는 본문이 판시 내용이고 요지가 outcome에 따로 있다. 국가법령정보센터 판례는 outcome 없이 본문이 판결요지다.
export const splitSections = (content, type, { hasOutcome = true } = {}) => {
  const parts = content.split(SECTION_MARKER);
  const sections = [];
  const lead = parts[0].trim();
  const leadTitle = type === 'PRECEDENT' && !hasOutcome ? OUTCOME_TITLE.PRECEDENT : DEFAULT_SECTION_TITLE[type];
  if (lead) sections.push({ title: leadTitle ?? '내용', body: lead });
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1]?.trim();
    if (body) sections.push({ title: SECTION_TITLE_ALIASES[parts[i]] ?? parts[i], body });
  }
  return sections;
};

// 판례 원문의 판시사항은 "[1] … [2] …"가 한 줄로 이어져 있어서 번호마다 줄을 바꾼다.
export const breakNumberedItems = (text) => text.replace(/\s+(?=\[\d+\])/g, '\n');

export const OUTCOME_TITLE = { CASE: '조정 결과', PRECEDENT: '판결 요지' };

// [내 상황에 적용해 보기]로 챗봇 입력창에 미리 넣는 질문
export const toApplyQuestion = (reference) =>
  `"${reference.title}" ${TYPE_LABELS[reference.type] ?? '자료'}가 제 상황에도 해당하는지 알고 싶어요.\n제 상황: `;

// 임대차 분쟁 센터(포털) 화면에 고정으로 보여 주는 내용. 시안이라 API 없이 화면 쪽에 둔다.
// 법 기준·순서는 기관 자료(조사 문서)로 쓴 초안이라, 실제로 내보내기 전에 법령 원문과 기관 안내로 다시 확인한다.

// 상담·조정 기관. key는 브리핑의 institutions에서 고를 때 쓴다.
export const INSTITUTIONS = [
  {
    key: 'housingCommittee',
    name: '주택임대차분쟁조정위원회',
    role: '소송 없이 조정',
    contact: 'hldcc.or.kr · adrhome.reb.or.kr',
    href: 'https://www.hldcc.or.kr',
  },
  {
    key: 'seoulCenter',
    name: '서울시 전월세종합지원센터',
    role: '무료 상담',
    contact: '02-2133-1200',
    href: 'https://housing.seoul.go.kr/site/main/content/sh04_020100',
  },
  {
    key: 'klac',
    name: '대한법률구조공단',
    role: '무료 법률상담',
    contact: '국번 없이 132',
    href: 'https://www.klac.or.kr',
  },
  {
    key: 'easylaw',
    name: '찾기쉬운 생활법령정보',
    role: '법령 해설',
    contact: 'easylaw.go.kr',
    href: 'https://easylaw.go.kr/CSP/CsmMain.laf?csmSeq=277',
  },
];

export const findInstitutions = (keys) => INSTITUTIONS.filter((item) => keys.includes(item.key));

// 상황별 브리핑. key는 DISPUTE_TOPICS(utils/disputeReference.js)와 같다.
export const TOPIC_BRIEFINGS = {
  deposit: {
    headline: '계약이 끝나면 집을 돌려받는 것과 동시에 보증금을 돌려줘야 해요.',
    laws: ['민법 제536조 (동시이행)', '주택임대차보호법 제3조의3 (임차권등기명령)'],
    steps: ['공제할 금액(월세·관리비·수리비)을 근거와 함께 정리', '임차인에게 정산 내역을 문서로 알림', '바로 못 돌려주면 지급 날짜를 정해 합의', '합의가 안 되면 분쟁조정 신청'],
    cautions: ['임차권등기가 되면 다음 세입자를 구하기 어려워져요', '공제 근거(사진·영수증)가 없으면 공제를 인정받기 어려워요'],
    institutions: ['housingCommittee', 'seoulCenter', 'klac'],
    // 보증금 반환은 '여기서 끝나는' 상세 안내 시안. 다른 상황도 같은 구조로 넓힌다.
    guide: {
      // 문장마다 basis(근거 조문·판례), condition(적용 조건), q(관련 판례 검색어)를 붙여 [근거 보기]로 펼친다.
      checks: [
        {
          label: '계약이 끝났나요?',
          detail: '기간 만료나 합의 해지인지 확인하세요. 묵시적으로 갱신된 계약은 임차인이 해지를 알린 뒤 3개월이 지나야 끝나요',
          basis: '주택임대차보호법 제6조의2 (묵시적 갱신 시 계약의 해지)',
          condition: '3개월은 임대인이 해지 통지를 받은 날부터 셉니다. 묵시적 갱신이 아닌 계약은 계약서의 기간을 따라요',
          q: '묵시적',
        },
        {
          label: '집을 돌려받았나요?',
          detail: '짐을 빼고 열쇠·비밀번호를 넘겼는지 확인하세요. 집을 돌려받는 것과 보증금 반환은 같이 이뤄져요',
          basis: '민법 제536조 (동시이행의 항변권), 판례: 보증금 반환과 목적물 반환은 동시이행 관계',
          condition: '임차인이 집을 비우지 않았다면 임대인도 보증금 반환을 미룰 수 있어요. 반대로 집을 돌려받았다면 바로 돌려줘야 해요',
          q: '동시이행',
        },
        {
          label: '밀린 돈이 있나요?',
          detail: '밀린 월세·관리비 등은 보증금에서 뺄 수 있어요. 뺄 금액은 임대인이 근거로 보여 줘야 해요',
          basis: '판례: 보증금은 집을 돌려받을 때까지 생긴 임차인의 채무를 담보해요 / 공제 채권의 증명책임은 임대인에게',
          condition: '계약서·입금 내역·고지서처럼 금액을 보여 줄 자료가 있어야 해요',
          q: '증명책임',
        },
        {
          label: '고칠 곳이 있나요?',
          detail: '임차인의 고의·과실로 망가진 곳은 원상복구비로 뺄 수 있어요. 오래 써서 자연스럽게 닳은 부분은 보통 빼지 못해요',
          basis: '민법 제615조·제654조 (원상회복), 판례: 통상의 손모는 원상회복 대상 아님',
          condition: '특약이나 파손 정도에 따라 달라질 수 있어요. 도배·장판은 쓴 기간만큼 감가해서 보는 사례가 많아요',
          q: '손모',
        },
      ],
      cases: [
        {
          key: 'normal',
          title: '문제없이 끝나는 경우',
          action: '퇴거일에 집 상태와 열쇠를 확인하고 같은 날 보증금을 돌려주세요. 새 세입자를 못 구한 것은 반환을 미룰 이유가 되지 않아요.',
          basis: '민법 제536조, 판례: 보증금 반환과 목적물 반환은 동시이행 관계',
          condition: '임차인이 집을 돌려준 경우예요. 새 임차인을 구하는 것은 반환의 조건이 아니에요',
          q: '반환 시기',
          // 관련 판례는 q 대신 이 말로 찾는다(판례에는 '반환 시기'라는 말이 없다).
          precedentQ: '동시이행',
        },
        {
          key: 'deduction',
          title: '공제 금액으로 다투는 경우',
          action: '공제 항목과 금액을 사진·견적서와 함께 문서로 보내세요. 다툼 없는 금액은 먼저 돌려주고 나머지만 협의하는 방법도 있어요.',
          basis: '판례: 공제 채권의 증명책임은 임대인에게 / 민법 제397조 (금전채무 불이행의 특칙)',
          condition: '집을 돌려받은 뒤에도 돌려주지 않은 금액에는 지연손해금이 붙을 수 있어요. 공제가 정당한지는 증거에 따라 달라져요',
          q: '공제',
        },
        {
          key: 'delay',
          title: '바로 돌려주기 어려운 경우',
          action: '돌려줄 날짜를 정해 합의서로 남기세요. 늦어지는 동안 지연손해금이 붙고, 임차인은 임차권등기명령을 신청할 수 있어요.',
          basis: '주택임대차보호법 제3조의3 (임차권등기명령), 민법 제397조, 소송촉진 등에 관한 특례법 제3조',
          condition: '소송이 시작되면 소장을 받은 다음 날부터 더 높은 이율(현행 연 12%)이 적용될 수 있어요',
          q: '임차권등기',
        },
        {
          key: 'noContact',
          title: '임차인이 연락이 안 되거나 안 받는 경우',
          action: '짐을 마음대로 치우거나 집에 들어가면 안 돼요. 요건이 맞으면 보증금을 법원에 공탁할 수 있고, 집을 비우지 않으면 명도소송으로 해결해요.',
          basis: '민법 제487조 (변제공탁)',
          condition: '공탁은 임차인이 받기를 거절하거나 받을 수 없을 때 등에 할 수 있어요. 공탁해도 집을 돌려받으려면 별도로 명도 절차가 필요해요',
          q: '공탁',
        },
      ],
      documents: ['임대차 계약서와 특약', '보증금·월세 입금 내역', '관리비·공과금 정산 내역', '입주·퇴거 때 사진과 영상', '수리 견적서·영수증', '문자·통화 등 연락 기록'],
      procedure: [
        { title: '협의', detail: '정산 내역을 보여 주고 날짜·금액을 합의해요' },
        { title: '문서로 알리기', detail: '합의가 안 되면 요구 사항을 내용증명으로 보내요' },
        { title: '분쟁조정', detail: '조정위원회에 신청해요. 수수료 1만 원부터, 60일 안에 끝나요' },
        { title: '법원', detail: '조정이 안 되면 지급명령·소송으로 가요' },
      ],
      tools: [
        { key: 'certified', label: '내용증명 보내기', note: '인터넷우체국', href: 'https://www.epost.go.kr' },
        { key: 'deposit', label: '보증금 공탁', note: '법원 전자공탁', href: 'https://ekt.scourt.go.kr' },
        { key: 'calculator', label: '전월세 전환 계산기', note: '임대차분쟁조정위원회', href: 'https://adrhome.reb.or.kr/adrhome/reb/main' },
        { key: 'contract', label: '주택임대차 표준계약서', note: '임대차분쟁조정위원회', href: 'https://adrhome.reb.or.kr/adrhome/reb/main' },
      ],
    },
  },
  restore: {
    headline: '임차인은 나갈 때 원래대로 돌려놓아야 하지만, 살면서 자연스럽게 닳은 건 책임이 아니에요.',
    laws: ['민법 제615조·제654조 (원상회복)'],
    steps: ['입주 때 사진·영상과 지금 상태를 비교', '수리 견적서를 받아 임차인에게 보여 줌', '공제 금액을 합의', '합의가 안 되면 분쟁조정 신청'],
    cautions: ['도배·장판처럼 오래 쓰면 닳는 것은 쓴 기간만큼 감가돼요', '과하게 요구하면 임차인이 응하지 않아도 돼요'],
    institutions: ['housingCommittee', 'seoulCenter'],
  },
  repair: {
    headline: '살기 어려운 고장은 임대인이 고쳐야 하고, 작은 수리는 보통 임차인이 해요.',
    laws: ['민법 제623조 (임대인의 의무)'],
    steps: ['고장 원인과 범위를 확인 (사진·업체 의견)', '임대인 몫이면 수리 일정 안내', '비용 분담이 애매하면 계약서 특약 확인', '합의가 안 되면 분쟁조정 신청'],
    cautions: ['수리를 미루다 피해가 커지면 손해배상까지 갈 수 있어요', '누수·보일러 분쟁은 조정 사례가 많아요'],
    institutions: ['housingCommittee', 'seoulCenter'],
  },
  renewal: {
    headline: '임차인은 끝나기 6개월~2개월 전에 한 번 갱신을 요구할 수 있고, 정해진 사유가 없으면 거절할 수 없어요.',
    laws: ['주택임대차보호법 제6조 (묵시적 갱신)', '주택임대차보호법 제6조의3 (계약갱신 요구)', '민법 제640조 (차임 연체와 해지)'],
    steps: ['계약 끝나는 날과 갱신 요구가 온 날짜 확인', '거절 사유가 있는지 확인 (연체·실거주 등)', '갱신·거절 의사를 문서로 통지', '안 나가면 분쟁조정 → 명도소송'],
    cautions: ['아무 말 없이 기간이 지나면 같은 조건으로 묵시적 갱신돼요', '연락이 안 된다고 집에 들어가면 주거침입이 될 수 있어요'],
    institutions: ['housingCommittee', 'seoulCenter', 'klac'],
  },
  rent: {
    headline: '월세·보증금은 한 번에 5%를 넘게 올릴 수 없고, 올린 뒤 1년 안에는 다시 못 올려요.',
    laws: ['주택임대차보호법 제7조 (차임 등의 증감청구권)'],
    steps: ['지금 금액과 계약·증액 날짜 확인', '5% 안에서 올릴 금액 계산', '변경 내용을 문서(변경 계약서)로 남김', '변경 계약은 30일 안에 전월세 신고'],
    cautions: ['5%를 넘게 받은 부분은 돌려달라고 할 수 있어요'],
    institutions: ['housingCommittee', 'easylaw'],
  },
  other: {
    headline: '중개보수, 권리금(상가), 전월세 신고 같은 제도도 분쟁이 자주 생겨요.',
    laws: ['부동산 거래신고 등에 관한 법률 (주택 임대차 계약 신고)', '상가건물 임대차보호법 제10조의4 (권리금 회수기회 보호)'],
    steps: ['어떤 제도에 해당하는지 확인', '찾기쉬운 생활법령정보에서 기준 확인', '애매하면 무료 상담'],
    cautions: ['신고 과태료 기준은 바뀐 적이 있어 공식 안내를 확인하세요'],
    institutions: ['easylaw', 'klac'],
  },
};

// 첫 화면 '최근 임대차 이슈'. 기사 요약이 아니라 임대인에게 어떤 영향이 있는지와 근거를 붙인다.
// 시안이라 조사한 기사로 고정해 두고, 나중에는 뉴스 검색 + AI 요약으로 주마다 바꾼다.
export const WEEKLY_ISSUE = {
  title: '실거주로 갱신을 거절한 뒤 다른 사람에게 세를 주면 배상해야 해요',
  impact: '실거주를 이유로 갱신을 거절했다면 2년 안에는 다른 사람에게 세를 주지 마세요. 부득이한 사정이 생겼다면 그 사정을 입증할 자료를 남겨 두세요.',
  chips: ['주택임대차보호법 제6조의3', '2심 배상 3,079만 원 (10-13 보도)', '갱신·종료 조정 신청 증가'],
  searchQuery: '실거주',
  askDraft: '실거주를 이유로 갱신을 거절했는데, 이후 사정이 바뀌어 다른 사람에게 세를 주려고 해요.\n제 상황: ',
  topicKey: 'renewal',
  source: { press: '머니투데이', date: '2026-10-13', href: 'https://www.mt.co.kr/society/2026/10/13/2026101219493123965' },
};

// 검색창 아래 예시 질문. 지금 검색은 단어 포함으로 찾아서(#4 의미 검색 전) 문장 대신 핵심 단어(q)로 찾는다.
export const SEARCH_EXAMPLES = [
  { label: '보증금이 아직 안 들어왔어요', q: '보증금 반환' },
  { label: '세입자가 수리를 요구해요', q: '수선' },
  { label: '갱신 거절해도 되나요?', q: '갱신거절' },
];

// 분쟁 유형 카드 안의 질문 칩. 칩마다 자주 묻는 질문(apps/api/prisma/seed-data/dispute-faqs.json의 key) 하나를 연결해,
// 누르면 그 상황 안내 화면 맨 위에 정리된 답과 근거 자료를 펼친다.
export const TOPIC_QUESTIONS = {
  deposit: [
    { label: '언제 돌려줘야 하나', faq: 'deposit-new-tenant-delay' },
    { label: '공제할 수 있는 비용', faq: 'deposit-deduct-proof' },
    { label: '못 돌려줄 때 대응', faq: 'deposit-cannot-return' },
    { label: '일부만 돌려줄 때', faq: 'deposit-partial-return' },
    { label: '새 임차인과 관계', faq: 'deposit-new-tenant-relation' },
  ],
  restore: [
    { label: '원상복구 범위', faq: 'restore-normal-wear' },
    { label: '도배·장판 비용', faq: 'restore-full-replacement' },
    { label: '입주 사진이 없을 때', faq: 'restore-no-photo' },
  ],
  repair: [
    { label: '누가 고쳐야 하나', faq: 'repair-who-fixes' },
    { label: '보일러 고장', faq: 'repair-boiler' },
    { label: '수리비를 세입자가 냈을 때', faq: 'repair-tenant-paid' },
    { label: '수리 특약', faq: 'repair-waiver-clause' },
  ],
  renewal: [
    { label: '갱신 거절할 수 있는 경우', faq: 'renewal-refuse-realuse' },
    { label: '실거주 거절 후 주의', faq: 'restore-realuse-then-lease' },
    { label: '묵시적 갱신', faq: 'renewal-implicit-termination' },
    { label: '중도 해지', faq: 'renewal-early-termination' },
  ],
  rent: [
    { label: '얼마까지 올릴 수 있나', faq: 'rent-increase-cap' },
    { label: '월세 감액 요구', faq: 'rent-decrease-request' },
    { label: '전월세 전환', faq: 'rent-conversion' },
    { label: '월세가 밀릴 때', faq: 'rent-arrears' },
  ],
  other: [
    { label: '중개보수는 누가', faq: 'other-brokerage-fee' },
    { label: '권리금 (상가)', faq: 'other-premium-direct-use' },
    { label: '계약서 특약 해석', faq: 'other-contract-document' },
  ],
};

// '어디에 도움을 요청해야 하나요?' 기관 안내. 대상·신청인·비용·기간을 표로 보여 주고 바로 갈 버튼을 둔다.
// 수수료·기간은 기관 안내 기준이라 내보내기 전에 다시 확인한다.
export const HELP_ROUTES = [
  {
    key: 'committee',
    name: '임대차분쟁조정위원회',
    badge: '소송 없이 해결',
    when: '합의는 어렵지만 소송까지는 원하지 않을 때',
    facts: [
      ['대상', '보증금·월세, 계약 기간, 보증금 반환, 수선, 갱신·종료'],
      ['신청', '임대인·임차인 모두'],
      ['비용', '수수료 1만~10만 원 (금액별)'],
      ['기간', '원칙 60일 안 (30일 연장 가능)'],
    ],
    source: { label: '수수료·기간 기관 안내', href: 'https://adrhome.reb.or.kr/adrhome/reb/LO010100/03/10302000000002022101718' },
    actions: [
      { label: '조정 신청', href: 'https://adrhome.reb.or.kr/adrhome/reb/main', primary: true },
      { label: '절차 보기', href: 'https://adrhome.reb.or.kr/adrhome/reb/LO010100/03/10301000000002022101316' },
    ],
  },
  {
    key: 'seoul',
    name: '서울시 전월세종합지원센터',
    badge: '무료 상담',
    when: '우선 내 상황이 어떤지 상담받고 싶을 때',
    facts: [
      ['대상', '계약부터 종료까지 임대차 상담, 서울시 분쟁조정'],
      ['지역', '서울 소재 주택'],
      ['방법', '전화·온라인·방문'],
      ['연락', '02-2133-1200'],
    ],
    actions: [{ label: '상담 방법 보기', href: 'https://housing.seoul.go.kr/site/main/content/sh04_020100', primary: true }],
  },
  {
    key: 'klac',
    name: '대한법률구조공단',
    badge: '무료 법률상담',
    when: '소송까지 생각하고 법률 도움이 필요할 때',
    facts: [
      ['대상', '법률상담, 소득 기준에 따라 소송 지원'],
      ['방법', '전화 132 · 예약 방문'],
      ['비용', '상담 무료'],
    ],
    actions: [{ label: '상담 안내', href: 'https://www.klac.or.kr', primary: true }],
  },
];

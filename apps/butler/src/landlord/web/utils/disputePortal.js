// 임대차 분쟁 센터(포털) 화면에 고정으로 보여 주는 내용. 시안이라 API 없이 화면 쪽에 둔다.
// 법 기준·순서는 기관 자료(조사 문서)로 쓴 초안이라, 실제로 내보내기 전에 법령 원문과 기관 안내로 다시 확인한다.

// 상황별 브리핑. key는 DISPUTE_TOPICS(utils/disputeReference.js)와 같다. 상황마다 '여기서 끝나는' 안내(guide)를 같은 구조로 둔다.
// checks·cases 문장마다 basis(근거 조문·판례), condition(적용 조건), refs(근거 자료 sourceKey — 법령·판례·조정 사례)를 붙여 [근거 보기]로 펼친다.
// refs는 검색어 대신 자료를 직접 가리켜서, 누르면 자료 찾기를 거치지 않고 그 자료 상세로 간다(11-10, 로컬 DB에서 골라 확인).
// procedure는 상황 안내의 2~5단계(1단계는 '지금 상황 확인' = checks·cases). 단계마다 parts(documents·caseRefs·precedents)·tools·help(HELP_ROUTES key)로
// 그 단계에서 쓰는 자료·서식·기관을 붙인다(모든 도구·기관은 어느 한 단계에 들어간다).
// 근거는 seed-data의 법령 조문·사례집·자주 묻는 질문에서 가져왔다.
export const TOPIC_BRIEFINGS = {
  deposit: {
    headline: '계약이 끝나면 집을 돌려받는 것과 동시에 보증금을 돌려줘야 해요.',
    laws: ['민법 제536조 (동시이행)', '주택임대차보호법 제3조의3 (임차권등기명령)'],
    guide: {
      checks: [
        {
          label: '계약이 끝났나요?',
          detail: '기간 만료나 합의 해지인지 확인하세요. 묵시적으로 갱신된 계약은 임차인이 해지를 알린 뒤 3개월이 지나야 끝나요',
          basis: '주택임대차보호법 제6조의2 (묵시적 갱신 시 계약의 해지)',
          refs: ['law-hlpa-6-2', 'casebook-2025-H-06-1'],
          condition: '3개월은 임대인이 해지 통지를 받은 날부터 셉니다. 묵시적 갱신이 아닌 계약은 계약서의 기간을 따라요',
        },
        {
          label: '집을 돌려받았나요?',
          detail: '짐을 빼고 열쇠·비밀번호를 넘겼는지 확인하세요. 집을 돌려받는 것과 보증금 반환은 같이 이뤄져요',
          basis: '민법 제536조 (동시이행의 항변권), 판례: 보증금 반환과 목적물 반환은 동시이행 관계',
          refs: ['casebook-2025-P-87daka98'],
          condition: '임차인이 집을 비우지 않았다면 임대인도 보증금 반환을 미룰 수 있어요. 반대로 집을 돌려받았다면 바로 돌려줘야 해요',
        },
        {
          label: '밀린 돈이 있나요?',
          detail: '밀린 월세·관리비 등은 보증금에서 뺄 수 있어요. 뺄 금액은 임대인이 근거로 보여 줘야 해요',
          basis: '판례: 보증금은 집을 돌려받을 때까지 생긴 임차인의 채무를 담보해요 / 공제 채권의 증명책임은 임대인에게',
          refs: ['casebook-2025-P-95da14664', 'lawgo-prec-225083'],
          condition: '계약서·입금 내역·고지서처럼 금액을 보여 줄 자료가 있어야 해요',
        },
        {
          label: '고칠 곳이 있나요?',
          detail: '임차인의 고의·과실로 망가진 곳은 원상복구비로 뺄 수 있어요. 오래 써서 자연스럽게 닳은 부분은 보통 빼지 못해요',
          basis: '민법 제615조·제654조 (원상회복), 판례: 통상의 손모는 원상회복 대상 아님',
          refs: ['law-civil-654', 'casebook-2025-P-2005gahap100279'],
          condition: '특약이나 파손 정도에 따라 달라질 수 있어요. 도배·장판은 쓴 기간만큼 감가해서 보는 사례가 많아요',
        },
      ],
      cases: [
        {
          key: 'normal',
          title: '문제없이 끝나는 경우',
          action: '퇴거일에 집 상태와 열쇠를 확인하고 같은 날 보증금을 돌려주세요. 새 세입자를 못 구한 것은 반환을 미룰 이유가 되지 않아요.',
          basis: '민법 제536조, 판례: 보증금 반환과 목적물 반환은 동시이행 관계',
          refs: ['casebook-2025-P-87daka98', 'casebook-2025-H-03-3'],
          condition: '임차인이 집을 돌려준 경우예요. 새 임차인을 구하는 것은 반환의 조건이 아니에요',
        },
        {
          key: 'deduction',
          title: '공제 금액으로 다투는 경우',
          action: '공제 항목과 금액을 사진·견적서와 함께 문서로 보내세요. 다툼 없는 금액은 먼저 돌려주고 나머지만 협의하는 방법도 있어요.',
          basis: '판례: 공제 채권의 증명책임은 임대인에게 / 민법 제397조 (금전채무 불이행의 특칙)',
          refs: ['casebook-2025-P-95da14664', 'klac-2025-H-06'],
          condition: '집을 돌려받은 뒤에도 돌려주지 않은 금액에는 지연손해금이 붙을 수 있어요. 공제가 정당한지는 증거에 따라 달라져요',
        },
        {
          key: 'delay',
          title: '바로 돌려주기 어려운 경우',
          action: '돌려줄 날짜를 정해 합의서로 남기세요. 늦어지는 동안 지연손해금이 붙고, 임차인은 임차권등기명령을 신청할 수 있어요.',
          basis: '주택임대차보호법 제3조의3 (임차권등기명령), 민법 제397조, 소송촉진 등에 관한 특례법 제3조',
          refs: ['law-hlpa-3-3', 'klac-2018-H-17', 'seoul-2020-case-03'],
          condition: '소송이 시작되면 소장을 받은 다음 날부터 더 높은 이율(현행 연 12%)이 적용될 수 있어요',
        },
        {
          key: 'noContact',
          title: '임차인이 연락이 안 되거나 안 받는 경우',
          action: '짐을 마음대로 치우거나 집에 들어가면 안 돼요. 요건이 맞으면 보증금을 법원에 공탁할 수 있고, 집을 비우지 않으면 명도소송으로 해결해요.',
          basis: '민법 제487조 (변제공탁)',
          refs: [],
          condition: '공탁은 임차인이 받기를 거절하거나 받을 수 없을 때 등에 할 수 있어요. 공탁해도 집을 돌려받으려면 별도로 명도 절차가 필요해요',
        },
      ],
      documents: ['임대차 계약서와 특약', '보증금·월세 입금 내역', '관리비·공과금 정산 내역', '입주·퇴거 때 사진과 영상', '수리 견적서·영수증', '문자·통화 등 연락 기록'],
      procedure: [
        { title: '협의', detail: '정산 내역을 보여 주고 날짜·금액을 합의해요', parts: ['documents'], tools: ['calculator', 'contract'] },
        { title: '문서로 알리기', detail: '합의가 안 되면 요구 사항을 내용증명으로 보내요', tools: ['certified'] },
        { title: '분쟁조정', detail: '조정위원회에 신청해요. 수수료 1만 원부터, 60일 안에 끝나요', parts: ['caseRefs'], help: ['committee', 'seoul'] },
        { title: '법원', detail: '조정이 안 되면 지급명령·소송으로 가요', parts: ['precedents'], tools: ['deposit'], help: ['klac'] },
      ],
      tools: [
        { key: 'certified', label: '내용증명 보내기', note: '인터넷우체국', href: 'https://service.epost.go.kr/econprf.RetrieveEConprfReqSend.postal' },
        { key: 'deposit', label: '보증금 공탁', note: '법원 전자공탁', href: 'https://ekt.scourt.go.kr' },
        { key: 'calculator', label: '전월세 전환 계산기', note: '임대차분쟁조정위원회', href: 'https://adrhome.reb.or.kr/adrhome/reb/transfer/transferCalculatorForm.do?Key=10404000000002022101900' },
        { key: 'contract', label: '주택임대차 표준계약서', note: '임대차분쟁조정위원회 · PDF', href: 'https://adrhome.reb.or.kr/adrhome/reb/file/downloadContract.do?fileName=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%20%ED%91%9C%EC%A4%80%EA%B3%84%EC%95%BD%EC%84%9C.pdf' },
      ],
    },
  },
  restore: {
    headline: '임차인은 나갈 때 원래대로 돌려놓아야 하지만, 살면서 자연스럽게 닳은 건 책임이 아니에요.',
    laws: ['민법 제615조·제654조 (원상회복)'],
    guide: {
      checks: [
        {
          label: '입주 때 상태 기록이 있나요?',
          detail: '입주 때 사진·영상이나 물품 목록이 있어야 지금 상태와 비교할 수 있어요',
          basis: '조정 사례: 사진·동영상과 입주 때 제공한 물품 목록으로 하자를 판단',
          refs: ['molit-2022-H-s1-5'],
          condition: '사진으로 하자가 잘 보이지 않거나 경미하면 통상 노후화로 본 사례가 있어요',
        },
        {
          label: '닳은 건가요, 망가뜨린 건가요?',
          detail: '오래 살며 생긴 마모(통상의 손모)는 특약이 없으면 임차인 책임이 아니에요. 고의·과실로 망가뜨린 곳은 원상복구비를 청구할 수 있어요',
          basis: '민법 제615조·제654조 (원상회복), 판례: 통상의 손모는 특약이 없으면 원상회복 대상 아님',
          refs: ['casebook-2025-P-2005gahap100279', 'molit-2022-H-s1-6'],
          condition: '통상의 손모까지 임차인이 부담하게 하려면 그 범위가 계약서에 구체적으로 적혀 있어야 해요',
        },
        {
          label: '쓴 기간을 따져 봤나요?',
          detail: '도배·장판처럼 쓰면 닳는 것은 쓴 기간만큼 감가해서 일부만 인정되는 경우가 많아요',
          basis: '조정 사례: 감가를 고려해 청구액의 30~40% 정도 인정, 벽지·장판 220만 원 청구를 75만 원으로 합의',
          refs: ['molit-2022-H-s1-4', 'molit-2022-H-26'],
          condition: '감가 비율은 정해져 있지 않고 자재·사용 기간·파손 정도에 따라 달라요',
        },
        {
          label: '금액 근거가 있나요?',
          detail: '수리 견적서·영수증으로 금액을 보여 줘야 해요. 보증금에서 뺄 때도 근거를 함께 알려요',
          basis: '판례: 보증금에서 공제할 채권의 증명책임은 임대인에게',
          refs: ['casebook-2025-P-95da14664'],
          condition: '금액이 적정한지 다투면 현장조사 뒤 금액을 조정한 사례가 많아요',
        },
      ],
      cases: [
        {
          key: 'wear',
          title: '닳은 것을 두고 다투는 경우',
          action: '못 자국·변색처럼 생활하며 생긴 흔적은 청구하기 어려워요. 파손이 분명한 부분만 골라 청구하세요.',
          basis: '판례: 통상의 손모는 특약이 없으면 원상회복 대상 아님',
          refs: ['casebook-2025-P-2005gahap100279', 'klac-2025-H-11'],
          condition: '특약에 통상 손모까지 임차인 부담으로 구체적으로 적었다면 달라질 수 있어요',
        },
        {
          key: 'damage',
          title: '분명히 망가뜨린 경우',
          action: '파손 부위 사진과 수리 견적서를 함께 보내고, 쓴 기간을 고려한 금액으로 협의하세요. 보증금에서 뺄 때는 공제 내역을 문서로 알리세요.',
          basis: '민법 제615조·제654조, 조정 사례: 감가를 고려해 일부만 인정',
          refs: ['law-civil-654', 'molit-2022-H-s1-4'],
          condition: '감가와 통상 마모를 뺀 부분만 인정되는 경우가 많아요',
        },
        {
          key: 'noPhoto',
          title: '입주 기록이 없는 경우',
          action: '입주 전 도배·수리 영수증, 이전 임차인이 나갈 때 사진, 중개사 확인처럼 다른 자료를 모아 보세요. 경미한 하자는 통상 노후로 볼 수 있어요.',
          basis: '조정 사례: 사진·물품 목록 같은 자료로 하자를 판단, 자료가 부족하면 통상 노후화로 봄',
          refs: ['molit-2022-H-s1-5', 'klac-2023-H-02'],
          condition: '입주 때 제공한 물품 목록이 있던 사례에서는 원상회복비 일부를 임차인이 부담했어요',
        },
        {
          key: 'fixture',
          title: '임차인이 단 시설이 남아 있는 경우',
          action: '임차인이 단 선반·설비는 나갈 때 떼고 원래대로 해 달라고 할 수 있어요. 임대인 동의를 받아 달았다면 임차인이 매수를 청구할 수도 있어요.',
          basis: '민법 제615조 (부속시킨 물건의 철거), 민법 제646조 (부속물매수청구권)',
          refs: ['law-civil-646', 'lawgo-prec-201003', 'klac-2018-H-40'],
          condition: '집 가치를 높인 비용(유익비)은 계약이 끝날 때 가치가 남아 있으면 임차인이 청구할 수 있어요(민법 제626조)',
        },
      ],
      documents: ['임대차 계약서와 특약', '입주·퇴거 때 사진과 영상', '입주 때 물품 목록', '수리 견적서·영수증', '도배·장판 시공 시기 자료', '문자·통화 등 연락 기록'],
      procedure: [
        { title: '상태 확인', detail: '퇴거일에 임차인과 함께 상태를 보고 사진으로 남겨요', parts: ['documents'] },
        { title: '문서로 알리기', detail: '공제 항목·금액을 견적서와 함께 문서로 보내요', tools: ['certified', 'contract'] },
        { title: '분쟁조정', detail: '조정위원회에 신청해요. 현장조사로 금액을 조정하기도 해요', parts: ['caseRefs'], help: ['committee', 'seoul'] },
        { title: '법원', detail: '조정이 안 되면 소송으로 가요', parts: ['precedents'], help: ['klac'] },
      ],
      tools: [
        { key: 'certified', label: '내용증명 보내기', note: '인터넷우체국', href: 'https://service.epost.go.kr/econprf.RetrieveEConprfReqSend.postal' },
        { key: 'contract', label: '주택임대차 표준계약서', note: '임대차분쟁조정위원회 · PDF', href: 'https://adrhome.reb.or.kr/adrhome/reb/file/downloadContract.do?fileName=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%20%ED%91%9C%EC%A4%80%EA%B3%84%EC%95%BD%EC%84%9C.pdf' },
      ],
    },
  },
  repair: {
    headline: '살기 어려운 고장은 임대인이 고쳐야 하고, 쉽게 고칠 수 있는 작은 수리는 보통 임차인이 해요.',
    laws: ['민법 제623조 (임대인의 의무)', '민법 제626조 (임차인의 상환청구권)'],
    guide: {
      checks: [
        {
          label: '살기 어려울 정도의 고장인가요?',
          detail: '누수·난방처럼 집을 쓰기 어려운 고장은 임대인이 고쳐야 해요. 쉽게 고칠 수 있는 작은 고장은 보통 임차인 몫이에요',
          basis: '민법 제623조 (사용·수익에 필요한 상태를 유지할 의무), 판례: 사소한 파손은 임대인의 수선 대상 아님',
          refs: ['law-civil-623', 'casebook-2025-P-2009da96984'],
          condition: '집을 쓰기 어려울 정도라면 임대인 잘못이 없어도 임대인이 고쳐야 해요',
        },
        {
          label: '원인을 확인했나요?',
          detail: '임차인이 잘못 써서 생긴 고장이면 임차인 부담일 수 있어요. 원인을 사진과 업체 의견으로 남기세요',
          basis: '조정 사례: 보일러 배관 동파 원인을 다툰 사례에서 비용 100만 원 중 40만 원을 임차인이 부담',
          refs: ['klac-2018-H-20'],
          condition: '원인이 분명하지 않으면 비용을 나누기로 합의한 사례가 있어요',
        },
        {
          label: '수리 특약이 있나요?',
          detail: "'수리는 임차인이 한다'는 특약이 있어도 작은 수리에만 적용돼요",
          basis: '판례: 수선의무 면제 특약은 소규모 수선에만 적용',
          refs: ['casebook-2025-P-94da34692'],
          condition: '큰 파손, 주요 구성부분의 대수선, 기본 설비 교체는 특약이 있어도 임대인이 부담해요',
        },
        {
          label: '언제 알게 됐나요?',
          detail: '수리가 필요하면 임차인은 바로 임대인에게 알려야 해요. 늦게 알려 피해가 커졌다면 그 부분은 따져 볼 수 있어요',
          basis: '민법 제634조 (임차인의 통지의무)',
          refs: ['law-civil-634'],
          condition: '임대인이 이미 알고 있었다면 임차인이 따로 알릴 의무는 없어요',
        },
      ],
      cases: [
        {
          key: 'landlord',
          title: '임대인이 고쳐야 하는 경우',
          action: '수리 일정을 정해 알리고, 고치러 들어갈 날짜를 미리 협의하세요. 집을 보존하는 데 필요한 수리는 임차인이 거절할 수 없어요.',
          basis: '민법 제623조, 민법 제624조 (임대인의 보존행위, 인용의무)',
          refs: ['law-civil-623', 'klac-2025-H-09'],
          condition: '수리를 미루다 피해가 커지면 손해배상까지 문제가 될 수 있어요',
        },
        {
          key: 'tenantPaid',
          title: '임차인이 먼저 고치고 비용을 달라는 경우',
          action: '집을 보존하는 데 필요한 비용(필요비)이면 돌려줘야 해요. 고장 사진과 영수증을 받아 금액을 확인하세요.',
          basis: '민법 제626조 (임차인의 상환청구권)',
          refs: ['law-civil-626', 'molit-2022-H-s2-2'],
          condition: '필요비는 임대인 동의가 없어도 청구할 수 있어요. 집 가치를 높인 비용(유익비)은 계약이 끝날 때 가치가 남아 있을 때만 돌려줘요',
        },
        {
          key: 'cause',
          title: '원인을 두고 다투는 경우',
          action: '업체 의견서와 사진으로 원인을 확인하세요. 원인이 분명하지 않으면 비용을 나누는 합의도 방법이에요.',
          basis: '조정 사례: 보일러 배관 동파 비용을 나눠 부담',
          refs: ['klac-2018-H-20', 'klac-2018-H-19'],
          condition: '임차인이 잘못 썼다는 점은 이를 주장하는 쪽이 자료로 보여 줘야 다툼이 줄어요',
        },
        {
          key: 'small',
          title: '작은 수리를 요구하는 경우',
          action: '전구·소모품처럼 쉽게 고칠 수 있는 것은 보통 임차인 몫이에요. 계약서 특약에 범위를 구체적으로 적어 두면 다툼이 줄어요.',
          basis: '판례: 사소한 파손은 임대인의 수선 대상 아님 / 수선의무 면제 특약은 소규모 수선에만 적용',
          refs: ['casebook-2025-P-2009da96984', 'casebook-2025-P-94da34692'],
          condition: '작은 수리인지는 비용과 고치기 쉬운 정도로 판단해요',
        },
      ],
      documents: ['임대차 계약서와 특약', '고장 부위 사진·영상', '수리 업체 의견서·견적서', '수리 영수증', '임차인이 알린 날짜 (문자 등)', '이전 수리 이력'],
      procedure: [
        { title: '원인 확인', detail: '사진·업체 의견으로 원인과 범위를 확인해요', parts: ['documents'] },
        { title: '협의', detail: '누가 얼마를 낼지, 수리 일정을 정해요', tools: ['certified', 'contract'] },
        { title: '분쟁조정', detail: '합의가 안 되면 조정위원회에 신청해요', parts: ['caseRefs'], help: ['committee', 'seoul'] },
        { title: '법원', detail: '조정이 안 되면 소송으로 가요', parts: ['precedents'], help: ['klac'] },
      ],
      tools: [
        { key: 'certified', label: '내용증명 보내기', note: '인터넷우체국', href: 'https://service.epost.go.kr/econprf.RetrieveEConprfReqSend.postal' },
        { key: 'contract', label: '주택임대차 표준계약서', note: '임대차분쟁조정위원회 · PDF', href: 'https://adrhome.reb.or.kr/adrhome/reb/file/downloadContract.do?fileName=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%20%ED%91%9C%EC%A4%80%EA%B3%84%EC%95%BD%EC%84%9C.pdf' },
      ],
    },
  },
  renewal: {
    headline: '임차인은 끝나기 6개월~2개월 전에 한 번 갱신을 요구할 수 있고, 정해진 사유가 없으면 거절할 수 없어요.',
    laws: ['주택임대차보호법 제6조 (계약의 갱신)', '주택임대차보호법 제6조의3 (계약갱신 요구)', '민법 제640조 (차임 연체와 해지)'],
    guide: {
      checks: [
        {
          label: '갱신 요구가 기간 안에 왔나요?',
          detail: '임차인은 계약이 끝나기 6개월~2개월 전에 갱신을 요구할 수 있어요. 이 기간에 온 요구는 정당한 사유 없이 거절할 수 없어요',
          basis: '주택임대차보호법 제6조의3 제1항·제2항',
          refs: ['law-hlpa-6-3', 'casebook-2025-P-2022gadan6858'],
          condition: "갱신요구권은 한 번만 쓸 수 있고, 갱신되면 2년이에요. '갱신하겠다'고 분명히 말하지 않아도 갱신 요구로 본 판례가 있어요",
        },
        {
          label: '거절할 사유가 있나요?',
          detail: '2기 월세 연체, 몰래 다시 세를 준 경우, 고의·중과실 파손, 임대인·직계가족의 실거주 등 법에 정한 사유가 있어야 거절할 수 있어요',
          basis: '주택임대차보호법 제6조의3 제1항 각 호',
          refs: ['law-hlpa-6-3', 'casebook-2025-P-2021gadan108009'],
          condition: "계약할 때 '갱신 안 하겠다'는 약속을 받았어도, 분명하고 최종적인 포기가 아니면 인정되지 않을 수 있어요",
        },
        {
          label: '거절을 기간 안에 알렸나요?',
          detail: '끝나기 6개월~2개월 전에 거절이나 조건 변경을 알리지 않으면 같은 조건으로 다시 계약한 것으로 봐요(묵시적 갱신)',
          basis: '주택임대차보호법 제6조 (계약의 갱신)',
          refs: ['law-hlpa-6', 'klac-2023-H-15'],
          condition: '묵시적 갱신 기간은 2년이고, 임차인은 언제든 해지를 알릴 수 있어요(통지 받은 날부터 3개월 뒤 끝남)',
        },
        {
          label: '월세가 밀렸나요?',
          detail: '밀린 월세가 2기분에 이르면 계약을 해지할 수 있어요',
          basis: '민법 제640조 (차임연체와 해지), 주택임대차보호법 제6조의3 제1항 제1호',
          refs: ['law-civil-640', 'klac-2018-H-14'],
          condition: '보증금이 연체액보다 많이 남아 있어도 해지할 수 있어요. 그래도 집에 함부로 들어가면 안 돼요',
        },
      ],
      cases: [
        {
          key: 'realUse',
          title: '내가(가족이) 들어가 살려는 경우',
          action: '실거주 사유를 문서로 알리고 실제로 들어가 살아야 해요. 갱신됐을 기간 안에 정당한 사유 없이 다른 사람에게 세를 주면 손해를 배상해야 해요.',
          basis: '주택임대차보호법 제6조의3 제1항 제8호·제5항·제6항',
          refs: ['law-hlpa-6-3', 'casebook-2025-P-2022gaso1067836', 'casebook-2025-H-06-3'],
          condition: '거절할 때 예측할 수 없던 사정(가족 사망·해외 발령 등)은 정당한 사유로 본 판례가 있어요',
        },
        {
          key: 'implicit',
          title: '아무 말 없이 기간이 지난 경우',
          action: '같은 조건으로 2년 갱신된 것으로 봐요. 임차인은 언제든 해지를 알릴 수 있고, 통지를 받은 날부터 3개월 뒤 끝나요.',
          basis: '주택임대차보호법 제6조, 제6조의2 (묵시적 갱신의 경우 계약의 해지)',
          refs: ['law-hlpa-6-2', 'casebook-2025-H-06-1', 'klac-2018-H-08'],
          condition: '임대인은 묵시적 갱신 기간 중 마음대로 해지할 수 없어요',
        },
        {
          key: 'early',
          title: '기간 중 임차인이 나가겠다는 경우',
          action: '갱신요구로 갱신된 계약이면 통지 받은 날부터 3개월 뒤 끝나요. 처음 계약 기간 중이라면 끝낼 날짜와 비용을 합의로 정하세요.',
          basis: '주택임대차보호법 제6조의3 제4항, 제6조의2',
          refs: ['law-hlpa-6-2', 'klac-2018-H-41'],
          condition: '새 임차인 중개보수는 특별한 약정이 없으면 기존 임차인이 낼 성질이 아니라는 판례가 있어요',
        },
        {
          key: 'arrears',
          title: '월세가 밀린 경우',
          action: '연체 내역을 정리해 문서로 알리세요. 2기분에 이르면 해지를 통지할 수 있지만, 짐을 치우거나 집에 들어가면 안 되고 명도 절차를 거쳐야 해요.',
          basis: '민법 제640조 (차임연체와 해지)',
          refs: ['law-civil-640', 'molit-2022-H-01'],
          condition: '해지 뒤에도 임차인이 나가지 않으면 명도소송으로 해결해요',
        },
      ],
      documents: ['임대차 계약서 (기간·특약)', '갱신 요구·거절 문자나 내용증명', '통지한 날짜 기록', '월세 입금 내역', '실거주 계획 자료 (전입 예정 등)'],
      procedure: [
        { title: '날짜 확인', detail: '끝나는 날과 갱신 요구·거절이 오간 날짜를 확인해요', parts: ['documents'] },
        { title: '문서로 알리기', detail: '갱신·거절·해지 의사를 내용증명으로 남겨요', tools: ['certified', 'contract'] },
        { title: '분쟁조정', detail: '조정위원회에서 종료일·합의금 등을 조정해요', parts: ['caseRefs'], help: ['committee', 'seoul'] },
        { title: '법원', detail: '나가지 않으면 명도소송으로 가요', parts: ['precedents'], help: ['klac'] },
      ],
      tools: [
        { key: 'certified', label: '내용증명 보내기', note: '인터넷우체국', href: 'https://service.epost.go.kr/econprf.RetrieveEConprfReqSend.postal' },
        { key: 'contract', label: '주택임대차 표준계약서', note: '임대차분쟁조정위원회 · PDF', href: 'https://adrhome.reb.or.kr/adrhome/reb/file/downloadContract.do?fileName=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%20%ED%91%9C%EC%A4%80%EA%B3%84%EC%95%BD%EC%84%9C.pdf' },
      ],
    },
  },
  rent: {
    headline: '월세·보증금은 한 번에 5%를 넘게 올릴 수 없고, 올린 뒤 1년 안에는 다시 못 올려요.',
    laws: ['주택임대차보호법 제7조 (차임 등의 증감청구권)', '주택임대차보호법 제7조의2 (월차임 전환 시 산정률의 제한)'],
    guide: {
      checks: [
        {
          label: '올린 지 1년이 지났나요?',
          detail: '계약하거나 금액을 올린 뒤 1년 안에는 올려 달라고 할 수 없어요',
          basis: '주택임대차보호법 제7조 제1항, 시행령 제8조 제2항',
          refs: ['law-hlpa-7', 'law-hlpa-dec-8'],
          condition: '1년은 계약을 맺은 날이나 마지막으로 증액한 날부터 따져요',
        },
        {
          label: '5% 안인가요?',
          detail: '한 번에 지금 금액의 5%(20분의 1)를 넘게 올릴 수 없어요',
          basis: '주택임대차보호법 제7조 제2항, 시행령 제8조 제1항',
          refs: ['law-hlpa-7', 'law-hlpa-dec-8'],
          condition: '시·도 조례로 더 낮은 상한을 정할 수 있어요. 갱신요구로 갱신될 때도 이 범위 안에서만 올릴 수 있어요(제6조의3 제3항)',
        },
        {
          label: '전세를 월세로 바꾸나요?',
          detail: '갱신되는 계약은 같은 조건이 원칙이라 임차인이 동의해야 바꿀 수 있어요. 동의해도 전환율 상한을 넘을 수 없어요',
          basis: '주택임대차보호법 제7조의2, 시행령 제9조 (연 10%와 한국은행 기준금리 + 2% 중 낮은 비율)',
          refs: ['law-hlpa-7-2', 'law-hlpa-dec-9'],
          condition: '기준금리가 바뀌면 상한도 바뀌어요. 임대차분쟁조정위원회 계산기로 지금 기준을 확인하세요',
        },
        {
          label: '감액 요구를 받았나요?',
          detail: '세금·경제사정이 바뀌어 금액이 적절하지 않게 되면 임차인도 감액을 청구할 수 있어요',
          basis: '주택임대차보호법 제7조 제1항',
          refs: ['law-hlpa-7'],
          condition: '요구가 오면 무조건 깎아야 하는 건 아니고, 주변 시세 등을 따져 협의해요',
        },
      ],
      cases: [
        {
          key: 'increase',
          title: '갱신하며 올리려는 경우',
          action: '5% 안에서 금액을 정하고 변경 계약서로 남기세요. 상한을 넘게 받은 부분은 임차인이 돌려 달라고 할 수 있어요.',
          basis: '주택임대차보호법 제7조, 제6조의3 제3항, 제10조의2 (초과 차임 등의 반환청구)',
          refs: ['law-hlpa-10-2', 'casebook-2025-H-01-1', 'molit-2022-H-18'],
          condition: '조정 사례에서는 보증금과 월세를 각각 5% 올리는 것으로 합의하기도 했어요',
        },
        {
          key: 'decrease',
          title: '감액 요구를 받은 경우',
          action: '주변 시세와 비교한 자료를 보여 주고 협의하세요. 조정에서는 양쪽 사정을 비교해 소폭 조정으로 합의한 사례가 있어요.',
          basis: '주택임대차보호법 제7조 제1항, 조정 사례: 상가 감액·증액 요구를 약 3% 인상으로 합의',
          refs: ['law-hlpa-7', 'klac-2023-C-32'],
          condition: '합의가 안 되면 조정위원회에서 주변 시세를 근거로 조정할 수 있어요',
        },
        {
          key: 'conversion',
          title: '전세를 월세로 바꾸는 경우',
          action: '임차인 동의를 받고, 전환율 상한 안에서 월세를 계산하세요. 바꾼 내용은 변경 계약서로 남기세요.',
          basis: '주택임대차보호법 제7조의2, 시행령 제9조',
          refs: ['law-hlpa-7-2', 'molit-2022-H-20'],
          condition: '월세 상한 = 바꾸는 보증금 × 전환율 ÷ 12. 갱신이면 5% 상한도 함께 지켜야 해요',
        },
        {
          key: 'report',
          title: '금액을 바꾼 뒤',
          action: '보증금·월세가 바뀌면 변경 신고가 필요할 수 있어요. 신고 대상인지 부동산거래관리시스템에서 확인하세요.',
          basis: '부동산 거래신고 등에 관한 법률 (주택 임대차 계약의 신고)',
          refs: [],
          condition: '신고 대상 금액·지역과 과태료 기준은 바뀐 적이 있어 공식 안내를 확인하세요',
        },
      ],
      documents: ['임대차 계약서', '마지막으로 증액한 날짜 기록', '주변 시세 자료', '변경 계약서', '보증금·월세 입금 내역'],
      procedure: [
        { title: '계산', detail: '증액 가능 날짜와 5%·전환율 상한을 계산해요', tools: ['calculator'] },
        { title: '협의', detail: '근거 자료를 보여 주고 금액을 합의해요', parts: ['documents'] },
        { title: '변경 계약', detail: '변경 계약서를 쓰고 필요하면 신고해요', tools: ['contract', 'report'] },
        { title: '분쟁조정', detail: '합의가 안 되면 조정위원회에 신청해요', parts: ['caseRefs', 'precedents'], help: ['committee', 'seoul', 'klac'] },
      ],
      tools: [
        { key: 'calculator', label: '전월세 전환 계산기', note: '임대차분쟁조정위원회', href: 'https://adrhome.reb.or.kr/adrhome/reb/transfer/transferCalculatorForm.do?Key=10404000000002022101900' },
        { key: 'report', label: '주택 임대차 신고', note: '부동산거래관리시스템', href: 'https://rtms.molit.go.kr' },
        { key: 'contract', label: '주택임대차 표준계약서', note: '임대차분쟁조정위원회 · PDF', href: 'https://adrhome.reb.or.kr/adrhome/reb/file/downloadContract.do?fileName=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%20%ED%91%9C%EC%A4%80%EA%B3%84%EC%95%BD%EC%84%9C.pdf' },
      ],
    },
  },
  other: {
    headline: '중개보수, 권리금(상가), 계약서 특약, 분쟁조정 절차처럼 제도를 몰라 생기는 분쟁도 많아요.',
    laws: ['상가건물 임대차보호법 제10조의4 (권리금 회수기회 보호)', '공인중개사법 제32조 (중개보수)'],
    guide: {
      checks: [
        {
          label: '중개보수 문제인가요?',
          detail: '중개보수는 계약한 양쪽이 각자 자기 중개사에게 내요. 기간 중에 나가는 임차인이 새 임차인 중개보수를 내는지 자주 다퉈요',
          basis: '공인중개사법 제32조, 판례: 특별한 약정이 없으면 새 임차인 중개료는 기존 임차인 부담 아님',
          refs: ['casebook-2025-H-08-1'],
          condition: '중개보수 한도는 시·도 조례로 정해요. 특약으로 부담을 정했다면 그에 따라요',
        },
        {
          label: '상가 권리금 문제인가요?',
          detail: '계약이 끝나기 6개월 전부터 끝날 때까지, 임차인이 데려온 새 임차인과의 계약을 정당한 사유 없이 막으면 안 돼요',
          basis: '상가건물 임대차보호법 제10조의4',
          refs: ['law-clpa-10-4', 'casebook-2025-P-2018da284226'],
          condition: '주택이 아닌 상가에 적용돼요. 새 임차인이 월세를 낼 능력이 없는 경우 등은 정당한 사유로 봐요',
        },
        {
          label: '계약서 특약을 두고 다투나요?',
          detail: '계약서에 적힌 내용은 분명한 반대 증거가 없으면 적힌 대로 인정돼요',
          basis: '판례: 처분문서는 진정 성립이 인정되면 그 내용대로 의사표시를 인정',
          refs: ['casebook-2025-P-2020da253430'],
          condition: '임차인에게 불리한 특약은 법(강행규정)에 어긋나면 효력이 없을 수 있어요',
        },
        {
          label: '조정 신청서를 받았나요?',
          detail: '임차인이 조정을 신청하면 서류가 와요. 받은 날부터 7일 안에 참여 의사와 답변서를 내요',
          basis: '분쟁조정위원회 안내 (조정 절차 자주 묻는 질문)',
          refs: ['law-hlpa-21', 'law-hlpa-26'],
          condition: '내지 않아도 절차는 계속되지만, 피신청인이 조정에 응하지 않으면 각하될 수 있어요',
        },
      ],
      cases: [
        {
          key: 'brokerage',
          title: '새 임차인 중개보수를 다투는 경우',
          action: '계약서에 중개보수 부담 특약이 있는지 먼저 보세요. 약정이 없다면 나눠 내는 것으로 합의한 조정 사례가 있어요.',
          basis: '판례: 새 임차인 중개료는 특별한 약정이 없으면 기존 임차인 부담 아님, 조정 사례: 절반씩 부담',
          refs: ['casebook-2025-H-08-1', 'molit-2022-H-04'],
          condition: '앞으로 계약할 때는 중도 해지 시 중개보수 부담을 특약으로 적어 두면 다툼이 줄어요',
        },
        {
          key: 'premium',
          title: '상가를 직접 쓰려는 경우',
          action: '직접 쓰겠다며 새 임차인을 받지 않겠다는 뜻이 분명하면, 임차인이 새 임차인을 데려오지 않았어도 권리금 손해배상 문제가 될 수 있어요.',
          basis: '상가건물 임대차보호법 제10조의4 제3항, 판례: 임대인의 신규 임차인 거절 의사가 명백하면 주선 없이도 청구 가능',
          refs: ['law-clpa-10-4', 'casebook-2025-P-2018da284226', 'casebook-2025-C-03-1'],
          condition: '배상액은 새 임차인이 주기로 한 권리금과 종료 당시 권리금 중 낮은 금액을 넘지 않아요',
        },
        {
          key: 'clause',
          title: '특약 해석이 다른 경우',
          action: '계약서 원문과 특약을 그대로 보여 주고, 말로 한 약속은 문자 등 기록이 있는지 확인하세요.',
          basis: '판례: 처분문서의 기재 내용대로 의사표시 인정',
          refs: ['casebook-2025-P-2020da253430', 'klac-2018-H-27'],
          condition: "'협의가 안 되면 자동 만료' 같은 특약은 강행규정에 어긋날 소지가 있다고 본 조정 사례가 있어요",
        },
        {
          key: 'mediation',
          title: '조정에 응할지 고민되는 경우',
          action: '성립된 조정은 합의의 효력이 있고, 강제집행 승낙이 적힌 조정서는 판결처럼 집행할 수 있어요. 수수료는 1만~10만 원, 60일 안에 끝나요.',
          basis: '분쟁조정위원회 안내 (조정 효력·수수료·기간)',
          refs: ['law-hlpa-26', 'law-hlpa-27'],
          condition: '부득이하면 30일 범위에서 기간이 늘어날 수 있어요',
        },
      ],
      documents: ['임대차 계약서와 특약', '중개대상물 확인·설명서', '중개보수 영수증', '권리금 계약서 (상가)', '문자·통화 등 연락 기록'],
      procedure: [
        { title: '기준 확인', detail: '어떤 제도에 해당하는지 생활법령정보 등에서 확인해요', tools: ['easylaw'] },
        { title: '협의', detail: '계약서와 기준을 보여 주고 합의해요', parts: ['documents'], tools: ['contract'] },
        { title: '분쟁조정', detail: '조정위원회에 신청하거나 받은 신청에 답해요', parts: ['caseRefs'], tools: ['mediation'], help: ['committee', 'seoul'] },
        { title: '법원', detail: '조정이 안 되면 소송으로 가요', parts: ['precedents'], help: ['klac'] },
      ],
      tools: [
        { key: 'easylaw', label: '임대차 생활법령', note: '찾기쉬운 생활법령정보', href: 'https://easylaw.go.kr/CSP/CsmMain.laf?csmSeq=277' },
        { key: 'mediation', label: '분쟁조정 신청', note: '임대차분쟁조정위원회', href: 'https://adrhome.reb.or.kr/adrhome/reb/dispute/dispute.do?Key=10303000000002022101715' },
        { key: 'contract', label: '주택임대차 표준계약서', note: '임대차분쟁조정위원회 · PDF', href: 'https://adrhome.reb.or.kr/adrhome/reb/file/downloadContract.do?fileName=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%20%ED%91%9C%EC%A4%80%EA%B3%84%EC%95%BD%EC%84%9C.pdf' },
      ],
    },
  },
};

// 상황 안내 '준비할 자료' 아래 공식 기준. 항목 자체는 공식 첨부서류(계약서·등기부등본·사진·영수증·문서·내용증명)를
// 상황별로 풀어 쓴 것(사례집에서 실제로 증거로 쓴 자료)이고, 조정 신청 때 낼 서류는 기관 안내로 바로 잇는다(11-10 확인).
export const DOCUMENT_GUIDE = {
  text: '조정을 신청할 때는 조정신청서와 임대차계약서(필수), 등기부등본, 사진·영수증·문서·내용증명 같은 참고자료를 함께 내요.',
  links: [
    { label: '신청 서류 안내', note: '서울시 전월세종합지원센터', href: 'https://housing.seoul.go.kr/site/main/content/sh04_050002' },
    { label: '조정신청서 서식', note: '임대차분쟁조정위원회', href: 'https://adrhome.reb.or.kr/adrhome/reb/LO010100/03/10306000000002022101717' },
  ],
};

// 첫 화면 검색창 아래 '자주 묻는 질문'. 누르면 그 상황 안내에서 정리된 답을 바로 펼친다(topicKey + faq).
// 고른 질문·순서는 원본 사례·상담 446건(상담사례집 = 실제로 기관에 물은 질문 포함)에서 주제별 건수가 많은 순(11-10 집계):
// 갱신 거절·실거주 48 · 월세 인상 48 · 중도 해지 42 · 묵시적 갱신 32 · 보증금 공제 18. 권리금(27)은 상가라 뺐다.
export const POPULAR_QUESTIONS = [
  { label: '실거주로 갱신을 거절할 수 있나요?', topicKey: 'renewal', faq: 'renewal-refuse-realuse' },
  { label: '월세 얼마까지 올릴 수 있나요?', topicKey: 'rent', faq: 'rent-increase-cap' },
  { label: '세입자가 중간에 나가겠대요', topicKey: 'renewal', faq: 'renewal-early-termination' },
  { label: '묵시적 갱신 후 해지하면?', topicKey: 'renewal', faq: 'renewal-implicit-termination' },
  { label: '보증금에서 수리비를 빼려면?', topicKey: 'deposit', faq: 'deposit-deduct-proof' },
];

// 상황 안내 맨 위 '자주 묻는 질문' 칩. 칩마다 자주 묻는 질문(apps/api/prisma/seed-data/dispute-faqs.json의 key) 하나를 연결해,
// 누르면 그 상황 안내 화면 맨 위에 정리된 답과 근거 자료를 펼친다.
// 칩은 같은 계층이라 순서는 일이 벌어지는 차례(계약 → 계약 중 → 끝날 때 → 끝난 뒤)로 둔다. 클릭 기록이 쌓이면 많이 찾는 순으로 바꾼다.
export const TOPIC_QUESTIONS = {
  deposit: [
    { label: '새 임차인을 못 구했을 때', faq: 'deposit-new-tenant-delay' },
    { label: '공제할 수 있는 비용', faq: 'deposit-deduct-proof' },
    { label: '일부만 돌려줄 때', faq: 'deposit-partial-return' },
    { label: '못 돌려줄 때 대응', faq: 'deposit-cannot-return' },
  ],
  restore: [
    { label: '원상복구 범위', faq: 'restore-normal-wear' },
    { label: '도배·장판 비용', faq: 'restore-full-replacement' },
  ],
  repair: [
    { label: '수리 특약', faq: 'repair-waiver-clause' },
    { label: '누가 고쳐야 하나', faq: 'repair-who-fixes' },
    { label: '보일러 고장', faq: 'repair-boiler' },
    { label: '수리비를 세입자가 냈을 때', faq: 'repair-tenant-paid' },
  ],
  renewal: [
    { label: '중도 해지', faq: 'renewal-early-termination' },
    { label: '갱신 거절할 수 있는 경우', faq: 'renewal-refuse-realuse' },
    { label: '묵시적 갱신', faq: 'renewal-implicit-termination' },
    { label: '실거주 거절 후 주의', faq: 'restore-realuse-then-lease' },
  ],
  rent: [
    { label: '얼마까지 올릴 수 있나', faq: 'rent-increase-cap' },
    { label: '전월세 전환', faq: 'rent-conversion' },
    { label: '월세 감액 요구', faq: 'rent-decrease-request' },
    { label: '월세가 밀릴 때', faq: 'rent-arrears' },
  ],
  other: [
    { label: '계약서 특약 해석', faq: 'other-contract-document' },
    { label: '중개보수는 누가', faq: 'other-brokerage-fee' },
    { label: '권리금 (상가)', faq: 'other-premium-direct-use' },
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
      { label: '조정 신청', href: 'https://adrhome.reb.or.kr/adrhome/reb/dispute/dispute.do?Key=10303000000002022101715', primary: true },
      { label: '절차 보기', href: 'https://adrhome.reb.or.kr/adrhome/reb/LO010100/03/10301000000002022101316' },
    ],
  },
  {
    key: 'seoul',
    name: '서울시 전월세종합지원센터',
    badge: '무료 상담',
    // 전국 서비스라 지역 한정 기관은 카드에서 바로 밝힌다(근거조사 '약한 곳' 8번).
    region: '서울 소재 주택만',
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
    actions: [{ label: '상담 안내', href: 'https://www.klac.or.kr/legalstruct/consultationGuidance.do', primary: true }],
  },
];

// 첫 화면 맨 아래 '자료 출처'. 화면의 사례·판례·법령·가이드가 어디서 왔는지 밝힌다(사례집 고지: 인용 시 출처 표시).
// 목록은 apps/api/prisma/seed-data/README.md의 출처와 같게 두고, 링크는 기관 메인이 아니라 그 사례집을 받는 글로 바로 간다(API sourceLinks.js와 같은 글).
// 국토부 2022 조정사례집은 공식 게시 글을 찾지 못해 링크 없이 부동산원 항목 설명에만 적는다.
export const DATA_SOURCES = [
  {
    label: '조정사례',
    title: '한국부동산원·LH 조정사례집',
    detail: '2025 주택·상가건물 임대차분쟁 조정사례집(국토교통부·한국부동산원·LH), 2022 주택임대차분쟁 조정사례집(국토교통부)',
    href: 'https://adrhome.reb.or.kr/adrhome/reb/LO010100/bbs/View.do?Key=10501000000002022101718&boardNo=4&boardIdx=180',
  },
  {
    label: '조정사례',
    title: '법률구조공단 조정사례집',
    detail: '대한법률구조공단 주택 및 상가건물임대차분쟁 조정사례집(2025·2023·2018)',
    href: 'https://www.hldcc.or.kr/hp/li/arrCaseDetail.do?bbsSn=1831',
  },
  {
    label: '상담사례',
    title: '한국부동산원 상담사례집',
    detail: '2025 주택 및 상가건물 임대차 상담사례집, 2024 주택임대차 상담사례집(한국부동산원)',
    href: 'https://adrhome.reb.or.kr/adrhome/reb/LO010100/bbs/View.do?Key=10501000000002022101718&boardNo=4&boardIdx=181',
  },
  { label: '상담사례', title: '서울시 상가임대차 상담사례집', detail: '2023 상가임대차 상담사례집(서울특별시)', href: 'https://sftc.seoul.go.kr/fe/bbs/NR_view.do?bbsCd=2&bbsSeq=419' },
  { label: '판례·법령', title: '국가법령정보센터', detail: '국가법령정보센터 판례, 주택임대차보호법·민법 등 현행 법령', href: 'https://www.law.go.kr/법령/주택임대차보호법' },
  { label: '가이드', title: '서울시 주택임대차보호법 가이드북', detail: '서울특별시 개정 주택임대차보호법 가이드북(2020)', href: 'https://news.seoul.go.kr/citybuild/archives/511154' },
];

// 기관 연락처. 첫 화면은 도움받을 곳 카드(HELP_ROUTES와 key가 같음) 안에, 자료 찾기는 맨 아래 한 줄로 보여 준다.
// 번호는 기관 공식 안내에서 확인한 것만 쓴다(조정위원회 1644-5599는 조정 절차 페이지, 11-10 확인).
// note(운영시간·요금)도 공식 페이지에 있는 것만: 조정위원회는 절차 페이지, 132는 공단 메인 '통화료 발신자 부담'. 서울시 센터는 안내마다 시간이 달라 비워 둔다(11-12 확인).
export const CONTACTS = [
  { key: 'committee', name: '주택임대차분쟁조정위원회(한국부동산원)', short: '조정위원회', value: '1644-5599', href: 'tel:1644-5599', note: '평일 9:00~17:30' },
  { key: 'seoul', name: '서울시 전월세종합지원센터', short: '서울시 센터(서울만)', value: '02-2133-1200', href: 'tel:02-2133-1200' },
  { key: 'klac', name: '대한법률구조공단', short: '법률구조공단', value: '132', href: 'tel:132', note: '통화료 발신자 부담' },
];

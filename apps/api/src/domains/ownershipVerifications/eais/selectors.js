// Created: 2026-10-21 04:31
// 세움터 URL·선택자. 정찰 HTML과 첫 발급 실행(2026-10-20)의 사람 차례 기록에서 확인한 값만 둔다.
// 원본: eais-ledger src/selectors.ts. 사이트가 바뀌어 선택자가 깨지면 eais-ledger의 정찰 도구(npm run recon)로 다시 확인한다.

export const EAIS = {
  main: 'https://www.eais.go.kr/',
  // 로그인 방식 선택 화면 경로(정부 통합로그인)
  loginChoicePath: '/moct/awp/abb01/AWPABB01F11',
  // 아이디 로그인 화면 경로
  idLoginPath: '/moct/awp/abb01/AWPABB01F13',
  // 건축물대장 발급(주소 검색·대장 선택)
  issueSearch: 'https://www.eais.go.kr/moct/bci/aaa02/BCIAAA02L01',
  // 신청 확인(발급/열람 선택·주민번호 표시여부·신청하기)
  issueConfirmPath: '/moct/bci/aaa02/BCIAAA02F01',
  // 건축물대장 신청내역(「발급」 버튼)
  issueListPath: '/moct/bci/aaa04/BCIAAA04L01',
  // 발급본 뷰어(ClipReport, 새 창)
  viewerPath: '/report/BCIAAA04V01',
};

export const SEL = {
  // 머리말 로그인/로그아웃 버튼 — 글자로 구분한다(같은 class)
  headerAuthButton: 'button.btnLogin',
  // 로그인 방식 선택 화면의 「아이디 로그인」
  idLoginLink: '#idloginc li.id a.login-link',
  loginId: '#membId',
  loginPw: '#pwd',
  loginSubmit: 'button.login-btn',
  // 세션 만료 안내 팝업 안의 로그아웃
  sessionLogout: '#btnSessionLogout',

  // 건축물대장 발급(L01)
  // 검색칸 바깥 상자 — 안쪽 input은 이 상자를 눌러 활성화하기 전엔 폭 0
  searchBox: 'div.multiselect:has(input[placeholder="건축물 소재지를 입력하세요."])',
  searchInput: 'input.multiselect__input[placeholder="건축물 소재지를 입력하세요."]',
  // 자동완성 후보(건물 → 동 두 단계). 안내 문구 줄에는 .option__desc 가 없다.
  // 동 단계 후보 생김새만 기록됨 — 건물 후보도 같은 vue-multiselect 틀이라고 보고 같은 선택자를 쓴다(추정, 실패하면 사람 차례)
  searchOption: '.multiselect__content-wrapper li.multiselect__element .multiselect__option',
  searchButton: 'button.btnSrch',
  // 대장 종류 탭 — <li class="stN"><a><p>전유부</p><span><em>20</em>건</span></a></li>
  ledgerTab: 'li > a:has(> p):has(> span > em)',
  // 대장별 ag-grid(탭마다 하나씩, 보이는 것만 쓴다)
  gridRow: '.ag-center-cols-container [role="row"][row-index]',
  gridCheckbox: 'input.ag-checkbox-input',
  cartAdd: 'button.btnAddCart', // 「신청할 민원 담기」
  cartTotal: 'p.total em', // 「총 N건의 민원이 있습니다」
  // 담긴 민원 줄 — 서버에 남아 다음 로그인에도 보인다
  cartItem: 'ul.complaintList > li:not(.noneResult):not(.addResult)',
  cartSubmit: 'button.btnSubmit', // 「건축물대장 발급 신청」 → 신청 확인 화면

  // 신청 확인 화면
  issueRadio: '#check1', // 「건축물대장을 발급합니다.」 (name=issueReadGbCd)
  issueRadioLabel: 'label[for="check1"]',
  showIdCheckbox: '#checking', // 「주민(법인)등록번호 표시여부」 — 체크하지 않는다
  // 신청 확인 화면의 소재지 표 줄과 줄별 삭제 버튼
  confirmRow: 'table.tableScroll tbody tr',
  confirmRowDelete: 'button.btnDelCell',
  applyButton: 'button.btnNext.btnSolid.btnLarge', // 「신청하기」
  // 신청내역 표의 「발급」 배지
  issueBadge: 'a.tbsBadge[title="발급"]',

  // 뷰어(ClipReport) — id 뒤에 실행마다 바뀌는 해시가 붙어 접두어로 찾는다
  viewerCanvas: 'canvas',
  viewerCurrentPage: 'input[id^="re_input"][title="현재 페이지"]',
  viewerTotalPages: 'input[id^="re_totalCountNumber"]',
  viewerNext: 'button[id^="re_next"][title="다음 페이지로 이동"]',
  viewerZoom: 'select[id^="re_zoomSelect"]',
};

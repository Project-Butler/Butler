// Created: 2026-10-21 04:33
// 세움터 로그인 · 건축물대장 발급 1건 · 뷰어 쪽별 캡처 · 로그아웃. 원본: eais-ledger src/eais.ts
// 원본과 달리 파일을 저장하지 않는다(스크린샷·화면 기록 없음). 캡처한 쪽은 PNG Buffer로 돌려준다.
// 규칙:
//   - 실행 1회에 발급은 최대 1건(세움터 자동화 제재 공지 2026-07-30 — "사람 수준 부하"로 쓰기로 함)
//   - 동작 사이 고정 1초 간격. 무작위로 흔들거나 사람 동작을 흉내 내는 탐지 회피는 하지 않는다
//   - 하나로 좁혀지지 않으면 임의로 고르지 않고 멈춘다(StopError + 후보 목록)
//   - 로그인 실패는 재시도하지 않는다(계정 잠금 방지)
//   - 신청 확인 화면의 주민등록번호 표시 여부는 체크하지 않는다
//   - 캡차·추가 인증·자동으로 못 지나간 화면은 사람 차례다. headless면 기다리지 않고 멈춘다
import { STEP_TIMEOUT_MS } from './browser.js';
import { EAIS, SEL } from './selectors.js';
import {
  confirmCount,
  localDate,
  loginState,
  looksLikePayment,
  matchesTarget,
  pickAddressOption,
  pickDongOption,
  pickIssueRow,
  pickLedgerTab,
  pickUnitRow,
} from './issueCore.js';

// 사람이 브라우저에서 직접 하는 단계의 최대 대기
const HUMAN_WAIT_MS = 10 * 60_000;
// 클릭·입력·이동 사이 고정 간격(사용자 요청 2026-10-20). 요청 속도를 사람이 쓰는 정도로 낮추는 용도다.
const ACTION_PAUSE_MS = 1000;
const pause = () => new Promise((r) => setTimeout(r, ACTION_PAUSE_MS));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 하나로 좁혀지지 않거나 화면이 예상과 달라 멈출 때 던진다. candidates는 사람이 보고 고를 수 있게 남기는 후보 글
export class StopError extends Error {
  constructor(message, candidates = []) {
    super(message);
    this.name = 'StopError';
    this.candidates = candidates;
  }
}

// 실행 상태. dialogs: 뜬 대화상자, humanSteps: 사람 차례 안내, autoFallbacks: 자동이 실패해 사람 차례로 넘긴 기록,
// expectConfirm: 지금 단계에서 받아들일 확인창(confirm) 수(0이면 예상 못 한 확인창은 취소), humanMode: 대화상자를 사람이 누름
export const createContext = (session) => {
  const ctx = { session, dialogs: [], humanSteps: [], autoFallbacks: [], expectConfirm: 0, humanMode: false, unexpectedDialog: null };
  const guard = (page) =>
    page.on('dialog', async (d) => {
      const msg = `${d.type()}: ${d.message().replace(/\s+/g, ' ').trim()}`;
      ctx.dialogs.push(msg);
      console.info(`[eais] 대화상자 — ${msg}`);
      if (ctx.humanMode) return; // 사람이 브라우저에서 누른다
      if (d.type() === 'alert') return d.accept().catch(() => undefined);
      if (d.type() === 'confirm' && ctx.expectConfirm > 0) {
        ctx.expectConfirm -= 1;
        return d.accept().catch(() => undefined);
      }
      ctx.unexpectedDialog = msg;
      return d.dismiss().catch(() => undefined);
    });
  guard(session.page);
  session.browser.on('targetcreated', async (t) => {
    const p = t.type() === 'page' ? await t.page() : null;
    if (p) guard(p);
  });
  return ctx;
};

const bodyText = (p) => p.evaluate('document.body ? document.body.innerText : ""');
const pathOf = (p) => new URL(p.url()).pathname;

const headerTexts = (p) => p.$$eval(SEL.headerAuthButton, (els) => els.map((e) => (e.textContent ?? '').trim())).catch(() => []);

// 머리말 로그인/로그아웃 버튼은 class가 같아 글자로 고른다
const headerHas = (label) =>
  `[...document.querySelectorAll(${JSON.stringify(SEL.headerAuthButton)})].some((e) => (e.textContent || '').trim() === ${JSON.stringify(label)})`;

const clickHeader = async (p, label) => {
  await pause();
  return p.evaluate(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(SEL.headerAuthButton)})].find((e) => (e.textContent || '').trim() === ${JSON.stringify(label)});
    if (b) b.click();
    return !!b;
  })()`);
};

// 가리는 것이 없을 때 클릭. 세움터는 로그인·신청 화면에서 「보안프로그램 로딩중」 덮개(KCase)를 띄우는데,
// 그 위에 클릭하면 아무 일도 안 일어난다(2026-10-20 첫 실행: 로그인 버튼 클릭이 무시됨) → 버튼 가운데 점의 맨 위 요소가 버튼일 때까지 기다린다.
const clickWhenFree = async (page, sel) => {
  await page.waitForFunction(
    `(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (top === el || el.contains(top));
    })()`,
    { timeout: STEP_TIMEOUT_MS },
  );
  await pause();
  await page.click(sel);
};

const typeInto = async (page, sel, text) => {
  await pause();
  await page.type(sel, text);
};

// 사람이 브라우저에서 직접 할 단계. done()이 참이 될 때까지 1초마다 확인한다.
// headless에서는 사람이 화면을 볼 수 없어 기다리지 않고 멈춘다.
const waitForHuman = async (ctx, message, done) => {
  ctx.humanSteps.push(message);
  if (ctx.session.headless) throw new StopError(`headless라 사람 차례를 진행할 수 없습니다: ${message}`);
  console.info(`\n[eais] ▶ 사람 차례: ${message}`);
  console.info('[eais]   (끝나면 자동으로 이어갑니다.)\n');
  ctx.humanMode = true;
  const until = Date.now() + HUMAN_WAIT_MS;
  try {
    while (Date.now() < until) {
      if (!ctx.session.browser.connected) throw new StopError('브라우저가 닫혔습니다.');
      if (await done().catch(() => false)) return;
      await wait(1000);
    }
    throw new StopError('사람 입력 대기 시간(10분)이 지났습니다.');
  } finally {
    ctx.humanMode = false;
  }
};

// 아이디 로그인. 실패하면 StopError(재시도 없음)
export const login = async (ctx, id, pw) => {
  const page = ctx.session.page;
  await page.goto(EAIS.main, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(headerHas('로그인'), { timeout: STEP_TIMEOUT_MS });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => undefined), clickHeader(page, '로그인')]);
  if (!pathOf(page).startsWith(EAIS.loginChoicePath)) throw new StopError(`로그인 방식 선택 화면이 아닙니다: ${pathOf(page)}`);
  await page.waitForSelector(SEL.idLoginLink, { visible: true });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => undefined), clickWhenFree(page, SEL.idLoginLink)]);
  try {
    // 「아이디 로그인」 클릭이 테두리만 바뀌고 무시될 때가 있다(2026-10-20 2회) → 입력칸이 안 나오면 한 번 더 누른다
    const shown = await page.waitForSelector(SEL.loginId, { visible: true, timeout: 5000 }).catch(() => null);
    if (!shown) {
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => undefined), clickWhenFree(page, SEL.idLoginLink)]);
      await page.waitForSelector(SEL.loginId, { visible: true });
    }
  } catch {
    throw new StopError(`아이디 입력칸이 보이지 않습니다: ${pathOf(page)}`);
  }
  await typeInto(page, SEL.loginId, id);
  await typeInto(page, SEL.loginPw, pw);
  const before = ctx.dialogs.length;
  await clickWhenFree(page, SEL.loginSubmit);

  // 성공(머리말 「로그아웃」) / 실패(오류 대화상자·문구) / 그 밖(캡차·추가 인증 → 사람)
  const judge = async () => loginState(await headerTexts(page), ctx.dialogs.slice(before), await bodyText(page).catch(() => ''));
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  let state = await judge();
  while (state === 'pending' && Date.now() < deadline) {
    await wait(1000);
    state = await judge().catch(() => 'pending');
  }
  if (state === 'pending') {
    await waitForHuman(ctx, '브라우저 창에서 자동입력방지 문자·추가 인증 등 남은 로그인 절차를 마쳐 주세요.', async () => (await judge()) !== 'pending');
    state = await judge();
  }
  if (state !== 'ok') throw new StopError('로그인에 실패했습니다(재시도하지 않습니다). 계정 잠금을 막기 위해 원인을 확인한 뒤 다시 실행하세요.');
  console.info('[eais] 로그인 성공');
};

// 로그아웃 — 실패해도 브라우저는 닫으므로 경고만
export const logout = async (ctx) => {
  const page = ctx.session.page;
  try {
    if (page.isClosed()) return;
    ctx.expectConfirm = 1;
    if (!(await clickHeader(page, '로그아웃'))) return console.info('[eais] 로그아웃 버튼 없음(이미 로그아웃)');
    await page
      .waitForFunction(headerHas('로그인'), { timeout: STEP_TIMEOUT_MS })
      .then(() => console.info('[eais] 로그아웃'))
      .catch(() => console.info('[eais] ⚠ 로그아웃 확인 못 함 — 브라우저를 닫아 세션을 끝냅니다'));
  } finally {
    ctx.expectConfirm = 0;
  }
};

// 담긴 줄·신청 확인 줄이 그 대상인지(지번·동·호 + 집합이면 전유부)
const sameTargetRow = (text, x) => matchesTarget(text, x) && (x.ledgerKind !== 'UNIT_EXCLUSIVE' || text.includes('전유부'));

// 「신청할 민원」 목록 — 두 번 연속(1초 간격) 같을 때까지 읽는다(첫 읽기는 2초 뒤, 최대 15초)
const readCartStable = async (page) => {
  const read = () => page.evaluate(`[...document.querySelectorAll(${JSON.stringify(SEL.cartItem)})].map((li) => li.innerText)`);
  await wait(2000);
  let prev = await read();
  for (const until = Date.now() + 13_000; Date.now() < until; ) {
    await wait(1000);
    const now = await read();
    if (JSON.stringify(now) === JSON.stringify(prev)) return now;
    prev = now;
  }
  return prev;
};

// 보이는 자동완성 후보(안내 문구 줄 제외)
const VISIBLE_OPTIONS = `[...document.querySelectorAll(${JSON.stringify(SEL.searchOption)})].filter((e) => e.querySelector('.option__desc') && e.getBoundingClientRect().height > 0)`;
// 보이는 표의 줄(탭마다 표가 따로 있어 숨은 표는 뺀다)
const VISIBLE_ROWS = `[...document.querySelectorAll(${JSON.stringify(SEL.gridRow)})].filter((r) => r.getBoundingClientRect().height > 0)`;
const VISIBLE_TABS = `[...document.querySelectorAll(${JSON.stringify(SEL.ledgerTab)})].filter((a) => a.getBoundingClientRect().height > 0)`;

// 주소 검색 → 대장 종류 탭 → 호 체크 → 「신청할 민원 담기」 → 「건축물대장 발급 신청」 (자동).
// 하나로 좁혀지지 않거나 화면이 예상과 다르면 StopError — 호출한 쪽이 사람 차례로 넘긴다.
const autoSearch = async (ctx, page, t, hint) => {
  const optionTexts = () => page.evaluate(`${VISIBLE_OPTIONS}.map((e) => e.innerText)`);
  const clickOption = async (i) => {
    const el = (await page.evaluateHandle(`${VISIBLE_OPTIONS}[${i}]`)).asElement();
    if (!el) throw new StopError('자동완성 후보가 사라졌습니다.');
    await pause();
    await el.click();
  };

  // ⓪ 이미 담긴 민원 — 신청하지 않은 담기는 서버에 남고, 목록은 페이지가 뜬 뒤 **늦게** 채워진다.
  //    목록이 두 번 연속 같을 때까지 기다려 읽고, 모두 이번 대상과 같은 줄이면(이전 실행이 남긴 것) 지우고 다시,
  //    다른 게 섞였으면 지우지 않고 멈춘다
  let cart = await readCartStable(page);
  if (cart.length) {
    if (!cart.every((c) => sameTargetRow(c, t))) {
      throw new StopError(`「신청할 민원」에 이번 대상이 아닌 민원이 있습니다(${cart.length}건). 세움터에서 직접 정리해 주세요.`, cart);
    }
    console.info(`[eais] 이전 실행에서 담고 신청하지 않은 같은 대상 ${cart.length}건을 지우고 다시 검색합니다.`);
    while (cart.length) {
      ctx.expectConfirm = 1;
      // × 버튼은 화면 오른쪽 퀵메뉴에 가려져 있다 → 좌표 클릭 대신 버튼 자체를 누른다
      await pause();
      await page.$eval(`${SEL.cartItem} button.btnDel`, (b) => b.click());
      const before = cart.length;
      const fewer = await page
        .waitForFunction(`document.querySelectorAll(${JSON.stringify(SEL.cartItem)}).length < ${before}`, { timeout: STEP_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false);
      ctx.expectConfirm = 0;
      if (!fewer) throw new StopError('담긴 민원을 지우지 못했습니다.');
      cart = await readCartStable(page);
    }
  }

  // ① 건물 자동완성
  await clickWhenFree(page, SEL.searchBox);
  const inputReady = await page
    .waitForFunction(`((document.querySelector(${JSON.stringify(SEL.searchInput)}) || {}).getBoundingClientRect?.().width || 0) > 0`, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!inputReady) throw new StopError('검색칸이 열리지 않았습니다(바깥 상자를 눌러도 입력칸 폭이 0).');
  await typeInto(page, SEL.searchInput, hint.query);
  const shown = await page
    .waitForFunction(`${VISIBLE_OPTIONS}.length > 0`, { timeout: STEP_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!shown) throw new StopError(`주소 자동완성 후보가 나오지 않았습니다(검색어 「${hint.query}」).`);
  const addr = pickAddressOption(await optionTexts(), t, hint.buildingName);
  if (addr.status === 'stop') throw new StopError(addr.reason, addr.candidates);
  await clickOption(addr.value);

  // ② 동 선택 단계(나올 때만)
  const dongShown = await page
    .waitForFunction(`${VISIBLE_OPTIONS}.some((e) => e.innerText.trim().startsWith('동명'))`, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (dongShown) {
    const dong = pickDongOption(await optionTexts(), t.dong);
    if (dong.status === 'stop') throw new StopError(dong.reason, dong.candidates);
    await clickOption(dong.value);
  }

  // ③ 검색 → 대장 종류 탭 (후보를 고르면 바로 나오기도 해서 먼저 3초 본다)
  const tabsVisible = (ms) =>
    page
      .waitForFunction(`${VISIBLE_TABS}.length > 0`, { timeout: ms })
      .then(() => true)
      .catch(() => false);
  if (!(await tabsVisible(3000))) {
    await clickWhenFree(page, SEL.searchButton);
    if (!(await tabsVisible(STEP_TIMEOUT_MS))) throw new StopError('검색 뒤 대장 종류 탭이 나오지 않았습니다.');
  }
  // 탭 건수는 「Loading...」 동안 0으로 보였다가 채워진다 → 고를 탭이 생기고 두 번 연속 같을 때까지(최대 30초)
  const readTabs = () =>
    page.evaluate(
      `${VISIBLE_TABS}.map((a) => ({ label: a.querySelector('p').innerText.trim(), count: Number(a.querySelector('span em').innerText.replace(/[^0-9]/g, '')) || 0 }))`,
    );
  let tabs = await readTabs();
  for (let prev = '', until = Date.now() + STEP_TIMEOUT_MS; Date.now() < until; ) {
    const now = JSON.stringify(tabs);
    if (now === prev && pickLedgerTab(tabs, t.ledgerKind).status === 'ok') break;
    prev = now;
    await wait(1000);
    tabs = await readTabs();
  }
  const tab = pickLedgerTab(tabs, t.ledgerKind);
  if (tab.status === 'stop') throw new StopError(tab.reason, tab.candidates);
  await pause();
  await page.evaluate(`${VISIBLE_TABS}[${tab.value}].click()`);

  // ④ 보이는 표에서 호 1줄 체크
  const rowsShown = await page
    .waitForFunction(`${VISIBLE_ROWS}.length > 0`, { timeout: STEP_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!rowsShown) throw new StopError('대장 목록 표가 나오지 않았습니다.');
  await wait(800); // 표가 다 그려지게(요소 등장 뒤 고정 1회)
  // ag-grid는 화면에 보이는 줄만 그린다(헬리오시티 112동: 1001호가 안 보여 실패) → 맞는 줄이 나올 때까지 표 안쪽을 한 화면씩 내린다
  const readRows = () =>
    page.evaluate(
      `${VISIBLE_ROWS}.map((r) => ({ dongNm: (r.querySelector('[col-id="dongNm"]') || {}).innerText || '', hoNm: (r.querySelector('[col-id="hoNm"]') || {}).innerText || '' }))`,
    );
  const scrollGrid = () =>
    page.evaluate(`(() => {
      const r = ${VISIBLE_ROWS}[0];
      const vp = r && r.closest('.ag-body-viewport');
      if (!vp) return false;
      const before = vp.scrollTop;
      vp.scrollTop = before + Math.max(vp.clientHeight - 48, 48);
      return vp.scrollTop > before;
    })()`);
  let rows = await readRows();
  let row = pickUnitRow(rows, t);
  const seen = new Set(rows.map((x) => `${x.dongNm} ${x.hoNm}`));
  for (let i = 0; row.status === 'stop' && rows.length && i < 200; i++) {
    if (!(await scrollGrid())) break; // 끝까지 내림
    await wait(400); // 새 줄이 그려지게(스크롤 뒤 고정)
    rows = await readRows();
    rows.forEach((x) => seen.add(`${x.dongNm} ${x.hoNm}`));
    row = pickUnitRow(rows, t);
  }
  if (row.status === 'stop') throw new StopError(`${row.reason}(표 전체 ${seen.size}줄 확인)`, [...seen].slice(0, 10));
  // ag-grid는 체크박스 칸과 글자 칸이 다른 줄 요소일 수 있어 같은 표 안의 같은 row-index로 찾는다
  const box = (
    await page.evaluateHandle(`(() => {
      const r = ${VISIBLE_ROWS}[${row.value}];
      const root = r.closest('.ag-root-wrapper') || document;
      return root.querySelector('[row-index="' + r.getAttribute('row-index') + '"] ${SEL.gridCheckbox}');
    })()`)
  ).asElement();
  if (!box) throw new StopError('선택 칸(체크박스)을 찾지 못했습니다.');
  await pause();
  await box.click();
  if (!(await box.evaluate((e) => e.checked))) throw new StopError('호실 선택 칸이 체크되지 않았습니다.');

  // ⑤ 담기 → 발급 신청
  await clickWhenFree(page, SEL.cartAdd);
  const after = await readCartStable(page);
  if (after.length !== 1) throw new StopError(`「신청할 민원」이 1건이 아닙니다(${after.length}건).`, after);
  await clickWhenFree(page, SEL.cartSubmit);
};

// 발급 화면 → 신청 확인 화면까지 + 점검(결제·소재지 1건·지번·호·전유부·「발급합니다」·주민번호 표시 꺼짐).
// 자동 검색이 실패하면 사람 차례로 넘긴다. 「신청하기」는 누르지 않는다.
const prepareApplication = async (ctx, t, hint) => {
  const page = ctx.session.page;
  await pause();
  await page.goto(EAIS.issueSearch, { waitUntil: 'domcontentloaded' });
  const atConfirm = async () => pathOf(page).startsWith(EAIS.issueConfirmPath) && !!(await page.$(SEL.applyButton));

  // ① 주소 검색 · 대장 선택 (자동 → 안 되면 사람)
  try {
    await autoSearch(ctx, page, t, hint);
    await page.waitForFunction(`location.pathname.startsWith(${JSON.stringify(EAIS.issueConfirmPath)})`, { timeout: STEP_TIMEOUT_MS });
    console.info('[eais] 주소 검색·대장 선택 자동 완료');
  } catch (e) {
    console.info(`[eais] 자동 검색 실패: ${e.message}`);
    if (e instanceof StopError) e.candidates.forEach((c, i) => console.info(`  ${i + 1}. ${c}`));
    ctx.autoFallbacks.push(`search: ${e.message}`);
    if (!(await atConfirm())) {
      const kindLabel = t.ledgerKind === 'UNIT_EXCLUSIVE' ? '전유부' : '일반건축물(또는 다가구)';
      await waitForHuman(
        ctx,
        `브라우저에서 「${hint.show}」을(를) 검색하고 대장 종류 「${kindLabel}」 1건만 골라 신청 확인 화면(「신청하기」 버튼이 있는 화면)까지 넘어가 주세요. 「신청하기」는 누르지 마세요.`,
        atConfirm,
      );
    }
  }
  await page.waitForSelector(SEL.applyButton, { visible: true });
  await wait(1500); // 화면이 다 그려지게(요소 등장 뒤 고정 대기 1회)

  // ② 신청 확인 화면 점검 (자동)
  const text = await bodyText(page);
  if (looksLikePayment(text)) throw new StopError('수수료 결제 화면으로 보입니다. 진행하지 않고 멈춥니다.');
  // 같은 대상 줄이 여러 개면(남아 있던 담기) 1줄만 남긴다. 다른 줄이 섞였으면 아래 건수 점검에서 멈춘다
  const readConfirmRows = () => page.$$eval(SEL.confirmRow, (els) => els.map((e) => e.innerText));
  let rows = await readConfirmRows();
  if (rows.length > 1 && rows.every((r) => sameTargetRow(r, t))) {
    console.info(`[eais] 신청 확인 화면에 같은 대상이 ${rows.length}줄 — 1줄만 남깁니다.`);
    while (rows.length > 1) {
      const before = rows.length;
      ctx.expectConfirm = 1;
      await clickWhenFree(page, `${SEL.confirmRow}:last-child ${SEL.confirmRowDelete}`);
      const fewer = await page
        .waitForFunction(`document.querySelectorAll(${JSON.stringify(SEL.confirmRow)}).length < ${before}`, { timeout: STEP_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false);
      ctx.expectConfirm = 0;
      if (!fewer) throw new StopError('신청 확인 화면에서 겹친 줄을 지우지 못했습니다.');
      rows = await readConfirmRows();
    }
    await wait(1000);
  }
  const n = confirmCount(await bodyText(page));
  if (n !== 1) throw new StopError(`신청 확인 화면의 소재지가 1건이 아닙니다(${n ?? '알 수 없음'}건). 1건만 담아 다시 실행하세요.`);
  if (!matchesTarget(text, t)) throw new StopError(`신청 확인 화면의 소재지가 발급 대상(지번 ${t.lot}${t.ho ? `, 호 ${t.ho}` : ''})와 다릅니다.`);
  if (t.ledgerKind === 'UNIT_EXCLUSIVE' && !/전유부/.test(text)) throw new StopError('신청서식이 전유부가 아닙니다.');

  // 「발급합니다」 선택 · 주민번호 표시여부는 끈 채로
  if (!(await page.$eval(SEL.issueRadio, (e) => e.checked))) await clickWhenFree(page, SEL.issueRadioLabel);
  if (await page.$eval(SEL.showIdCheckbox, (e) => e.checked)) {
    throw new StopError('「주민(법인)등록번호 표시여부」가 켜져 있습니다. 끄고 다시 실행하세요.');
  }
  console.info('[eais] 신청 확인 화면 점검 통과');
};

// 뷰어(ClipReport) 본문은 canvas라 DOM에 글자가 없다 → 쪽마다 캔버스 픽셀을 PNG로 받는다.
// 화면 비율 100%(1122×793)는 비전이 ㅁ/ㅇ 받침·작은 머리말을 틀린다 → 300%로 다시 그리게 해 캔버스 픽셀(3367×2381)을 그대로 받는다(2026-10-20 비교).
// 캔버스가 화면 밖으로 넘치므로 스크린샷 대신 toDataURL. 기기 배율(deviceScaleFactor)은 캔버스가 따르지 않아 쓸모없다. 300%를 바꾸지 말 것.
const VIEWER_ZOOM = '300%';

const captureViewer = async (viewer) => {
  viewer.setDefaultTimeout(STEP_TIMEOUT_MS);
  await viewer.waitForSelector(SEL.viewerTotalPages);
  await viewer.waitForSelector(SEL.viewerCanvas, { visible: true });
  await viewer.waitForNetworkIdle({ idleTime: 1000 }).catch(() => undefined);
  const total = Number(await viewer.$eval(SEL.viewerTotalPages, (e) => String(e.value).replace(/\D/g, ''))) || null;
  const zoomed = await viewer.evaluate(
    String.raw`(() => { const s = document.querySelector(${JSON.stringify(SEL.viewerZoom)}); if (!s) return false; const i = [...s.options].findIndex((o) => o.text === ${JSON.stringify(VIEWER_ZOOM)}); if (i < 0) return false; s.selectedIndex = i; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
  );
  if (!zoomed) console.info(`[eais] ⚠ 화면 비율 ${VIEWER_ZOOM} 선택 실패 — 100% 그대로 저장(인식률 낮음)`);
  await viewer.waitForNetworkIdle({ idleTime: 1000 }).catch(() => undefined);
  await wait(1500);
  const pages = [];
  // 모든 쪽을 받는다 — 소유자가 많으면 소유자현황 표가 다음 쪽으로 넘어갈 수 있다(사용자 결정 2026-10-20)
  const count = total ?? 1;
  for (let i = 1; i <= count; i++) {
    if (i > 1) {
      await pause();
      await viewer.click(SEL.viewerNext);
      await viewer
        .waitForFunction(`(document.querySelector(${JSON.stringify(SEL.viewerCurrentPage)})?.value ?? '').replace(/\D/g, '') === '${i}'`)
        .catch(() => console.info(`[eais] ⚠ ${i}쪽 이동 확인 못 함`));
      await viewer.waitForNetworkIdle({ idleTime: 800 }).catch(() => undefined);
      await wait(1000);
    }
    // 픽셀이 가장 큰 캔버스 = 본문
    const got = await viewer.evaluate(
      String.raw`(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; return c ? { size: c.width + 'x' + c.height, data: c.toDataURL('image/png') } : null; })()`,
    );
    if (!got) throw new StopError(`${i}쪽 캔버스를 찾지 못했습니다.`);
    pages.push({ page: i, size: got.size, png: Buffer.from(got.data.split(',')[1], 'base64') });
    console.info(`[eais] 발급본 ${i}/${count}쪽 캡처(${got.size})`);
  }
  return { pages, totalPages: total };
};

// 발급 1건: 신청 확인까지(prepareApplication) → 신청하기 → 신청내역 「발급」 → 뷰어 쪽별 캡처.
// hint: { query(자동완성 검색어), buildingName(같은 지번 건물이 여럿일 때), show(사람 차례 안내용) }
// 돌려주는 값: { issuedAt, pages: [{ page, size, png(Buffer) }], totalPages }
export const issueOnce = async (ctx, t, hint) => {
  const page = ctx.session.page;
  await prepareApplication(ctx, t, hint);

  // ③ 신청하기 → 신청내역
  ctx.expectConfirm = 1;
  ctx.unexpectedDialog = null;
  await clickWhenFree(page, SEL.applyButton);
  try {
    await page.waitForFunction(`location.pathname.startsWith(${JSON.stringify(EAIS.issueListPath)})`, { timeout: STEP_TIMEOUT_MS });
  } catch {
    throw new StopError(`신청 뒤 신청내역 화면으로 가지 않았습니다(${pathOf(page)}).${ctx.unexpectedDialog ? ` 대화상자: ${ctx.unexpectedDialog}` : ''}`);
  } finally {
    ctx.expectConfirm = 0;
  }
  await page.waitForSelector(SEL.issueBadge, { visible: true });
  await wait(1000);
  // 배지가 든 표 줄의 글(접수일·대장서식·건축물 위치) — 표 구조를 가정하지 않고 가장 가까운 tr
  const rows = await page.$$eval(SEL.issueBadge, (els) => els.map((e) => (e.closest('tr') ?? e.parentElement?.parentElement ?? e).innerText));
  const pick = pickIssueRow(rows, t, localDate(new Date()));
  if (pick.status === 'stop') throw new StopError(pick.reason, pick.candidates);

  // ④ 「발급」 → 뷰어 새 창
  const popup = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new StopError('발급 뷰어 창이 열리지 않았습니다.')), STEP_TIMEOUT_MS);
    ctx.session.browser.once('targetcreated', async (tg) => {
      const p = await tg.page();
      if (p) {
        clearTimeout(timer);
        resolve(p);
      }
    });
  });
  ctx.expectConfirm = 1;
  await pause();
  await page.$$eval(SEL.issueBadge, (els, i) => els[i].click(), pick.value);
  const viewer = await popup.finally(() => (ctx.expectConfirm = 0));
  const issuedAt = new Date().toISOString();
  console.info('[eais] 발급 뷰어 열림');
  const cap = await captureViewer(viewer);
  await viewer.close().catch(() => undefined);
  return { issuedAt, ...cap };
};

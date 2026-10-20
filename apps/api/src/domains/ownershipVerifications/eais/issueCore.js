// Created: 2026-10-21 04:31
// 세움터 화면 판단용 순수 함수(브라우저 없이 쓸 수 있다). 원본: eais-ledger src/issueCore.ts
// 원칙: 하나로 좁혀지지 않으면 임의로 고르지 않고 멈춘다.
//
// 발급 대상(target) 모양: { ledgerKind, lot, dong, ho }
//   ledgerKind — 'GENERAL'(일반건축물대장) | 'UNIT_EXCLUSIVE'(집합건축물대장 전유부)
//   lot        — 세움터 표기 지번 "660-9", 산이면 "산 12-3"
//   dong, ho   — 정규화한 값(접미사 없음) 또는 null
// 고르기 결과(pick) 모양: { status: 'ok', value } | { status: 'stop', reason, candidates }
import { normalizeDong, normalizeHo } from './dongho.js';

// 세움터 자동완성에 칠 지번 주소 — 시·도는 줄임말로("서울특별시 강서구 등촌동 660-9" → "서울 강서구 등촌동 660-9").
// 원 프로젝트는 Kakao 지번 주소(줄임말)를 그대로 쳐서 검증했다(2026-10-20). 긴 이름이 되는지는 확인 안 함 → 줄임말로 맞춘다.
const SIDO_SHORT = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산',
  세종특별자치시: '세종', 경기도: '경기', 강원특별자치도: '강원', 강원도: '강원', 충청북도: '충북', 충청남도: '충남',
  전북특별자치도: '전북', 전라북도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주',
};

// 지번 주소 + 동·호 → { target, query }, 잘못된 입력이면 오류 문구(string).
// 호가 있으면 집합건축물대장 전유부, 없으면 일반건축물대장(다가구 포함).
// 지번은 주소 끝의 "660-9" · "660-9번지" · "산 12-3" · "산12" 토큰. 도로명 주소는 받지 않는다(세움터 위치 표기가 지번이라 대조 불가).
export const parseTarget = ({ address, dong: dongInput, ho: hoInput }) => {
  const words = address.replace(/\s+/g, ' ').trim().split(' ');
  let last = words.pop() ?? '';
  let mountain = false;
  if (/^산\d/.test(last)) {
    mountain = true;
    last = last.slice(1);
  } else if (words[words.length - 1] === '산') {
    mountain = true;
    words.pop();
  }
  const m = /^(\d+)(?:-(\d+))?(?:번지)?$/.exec(last);
  if (!m || words.length < 2 || /\d*(로|길)$/.test(words[words.length - 1] ?? '')) {
    return '지번 주소가 필요합니다(예: "서울특별시 강서구 등촌동 660-9"). 도로명 주소는 받지 않습니다.';
  }
  const lot = `${mountain ? '산 ' : ''}${Number(m[1])}${m[2] && Number(m[2]) ? `-${Number(m[2])}` : ''}`;
  words[0] = SIDO_SHORT[words[0]] ?? words[0];
  const query = `${words.join(' ')} ${lot}`;
  const dong = normalizeDong(dongInput);
  const ho = normalizeHo(hoInput);
  if (dong && !ho) return '동만 있고 호가 없습니다. 집합건물은 호까지, 일반건물은 둘 다 빼 주세요.';
  return { target: { ledgerKind: ho ? 'UNIT_EXCLUSIVE' : 'GENERAL', lot, dong, ho }, query };
};

const squash = (s) => s.replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 세움터 "건축물 위치" 글(예: "서울특별시 강서구 등촌동 660-9 동명칭 없음 506")이 발급 대상과 맞는지.
// 지번은 앞뒤가 숫자·- 가 아닌 온전한 토큰으로, 호는 "506"·"506호" 토큰으로, 동은 있으면 "101"·"101동" 토큰으로 찾는다.
export const matchesTarget = (locationText, t) => {
  const s = ` ${squash(locationText)} `;
  const token = (v, suffix) => new RegExp(`(?<![\\d-])${escapeRe(v)}(?:${suffix})?(?![\\d-])`).test(s);
  if (!token(t.lot, '번지')) return false;
  if (t.ledgerKind === 'UNIT_EXCLUSIVE') {
    if (!t.ho || !token(t.ho, '호')) return false;
    if (t.dong && !token(t.dong, '동')) return false;
  }
  return true;
};

// 신청내역의 「발급」 배지 줄들 중 이번 신청 1줄 고르기 — 오늘 접수 + 위치 일치 + (집합이면) 전유부.
// 이전에 발급하지 않고 남겨 둔 줄이 있어도 날짜로 거른다. 같은 날 같은 대장을 여러 번 신청했으면(2026-10-20 확인)
// 목록이 최신순이므로 맨 첫 줄이 대상일 때만 그 줄을 고르고, 아니면 멈춘다.
export const pickIssueRow = (rowTexts, t, today) => {
  const hits = rowTexts
    .map((text, i) => ({ text: squash(text), i }))
    .filter(({ text }) => text.includes(today) && matchesTarget(text, t) && (t.ledgerKind !== 'UNIT_EXCLUSIVE' || text.includes('전유부')));
  if (hits.length === 1 || (hits.length > 1 && hits[0].i === 0)) return { status: 'ok', value: hits[0].i };
  return {
    status: 'stop',
    reason: hits.length ? `오늘 신청한 같은 대장의 「발급」 줄이 ${hits.length}개입니다.` : '오늘 신청한 대상의 「발급」 줄을 찾지 못했습니다.',
    candidates: (hits.length ? hits : rowTexts.map((text, i) => ({ text: squash(text), i }))).map((h) => h.text.slice(0, 120)),
  };
};

// 신청 확인 화면 본문 → 담긴 소재지 건수(「소재지 정보 총 N건」), 못 찾으면 null
export const confirmCount = (bodyText) => {
  const m = /소재지\s*정보\s*총\s*(\d+)\s*건/.exec(bodyText);
  return m ? Number(m[1]) : null;
};

// 수수료 결제를 요구하는 화면인지(결제 화면이면 진행하지 않고 멈춤)
export const looksLikePayment = (bodyText) => /결제하기|결제\s*수단|수수료\s*[:：]?\s*[1-9][\d,]*\s*원/.test(bodyText);

// 로그인 버튼을 누른 뒤의 상태 판정 → 'ok' | 'failed' | 'pending'.
// 머리말 버튼이 「로그아웃」이면 성공. 비밀번호·잠금 관련 대화상자/문구가 있으면 실패(재시도 안 함). 나머지는 대기.
export const loginState = (headerButtonTexts, dialogs, bodyText) => {
  if (headerButtonTexts.some((t) => squash(t) === '로그아웃')) return 'ok';
  const bad = /비밀번호.*(틀|일치하지|오류|잘못)|아이디.*(없|일치하지|잘못)|잠금|잠겼|잠김|횟수.*초과|로그인.*실패/;
  if (dialogs.some((d) => bad.test(d)) || bad.test(bodyText)) return 'failed';
  return 'pending';
};

// 오늘 날짜 YYYY-MM-DD (로컬) — 세움터 신청내역 접수일 표기
export const localDate = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ── 주소 검색·대장 선택 자동화 (2026-10-20 첫 발급의 사람 차례 기록에서 구조 확인) ──

// 자동완성 후보(건물) 중 지번이 맞는 것 1개. 건물명이 있으면 건물명도 맞는 것으로 좁힌다
export const pickAddressOption = (options, t, buildingName) => {
  let hits = options.map((text, i) => ({ text: squash(text), i })).filter(({ text }) => matchesTarget(text, { ...t, ledgerKind: 'GENERAL' }));
  if (hits.length > 1 && buildingName) {
    const byName = hits.filter(({ text }) => text.replace(/\s/g, '').includes(buildingName.replace(/\s/g, '')));
    if (byName.length) hits = byName;
  }
  if (hits.length === 1) return { status: 'ok', value: hits[0].i };
  return { status: 'stop', reason: `주소 자동완성 후보 중 맞는 건물이 ${hits.length}개입니다.`, candidates: options.map(squash).slice(0, 10) };
};

// 동 선택 단계 후보("동명 101동", "동명 동명칭없음") 중 1개 — 동이 없으면 「동명칭없음」
export const pickDongOption = (options, dong) => {
  const norm = options.map((text, i) => ({ text: squash(text).replace(/^동명\s*/, ''), i }));
  const hits = dong ? norm.filter(({ text }) => normalizeDong(text) === dong) : norm.filter(({ text }) => /동명칭\s*없음/.test(text));
  if (hits.length === 1) return { status: 'ok', value: hits[0].i };
  return { status: 'stop', reason: `동 후보 중 맞는 것이 ${hits.length}개입니다.`, candidates: norm.map((n) => n.text).slice(0, 10) };
};

// 대장 종류 탭([{ label, count }]) 중 고를 탭. 집합 = 전유부, 일반 = 건수 있는 「일반건축물」·「다가구」 중 하나
export const pickLedgerTab = (tabs, kind) => {
  const want = kind === 'UNIT_EXCLUSIVE' ? ['전유부'] : ['일반건축물', '다가구'];
  const hits = tabs.map((tab, i) => ({ ...tab, i })).filter((tab) => want.includes(tab.label) && tab.count > 0);
  if (hits.length === 1) return { status: 'ok', value: hits[0].i };
  return { status: 'stop', reason: `대장 종류 탭(${want.join('·')}) 중 건수 있는 탭이 ${hits.length}개입니다.`, candidates: tabs.map((x) => `${x.label} ${x.count}건`) };
};

// 보이는 표의 줄([{ dongNm, hoNm }]) 중 발급 대상 1줄. 일반건축물은 줄이 1개일 때만
export const pickUnitRow = (rows, t) => {
  const hits =
    t.ledgerKind === 'GENERAL'
      ? rows.map((_, i) => i)
      : rows
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => normalizeHo(r.hoNm) === t.ho && (t.dong ? normalizeDong(r.dongNm) === t.dong : !normalizeDong(r.dongNm) || /동명칭\s*없음/.test(r.dongNm)))
          .map(({ i }) => i);
  if (hits.length === 1) return { status: 'ok', value: hits[0] };
  return { status: 'stop', reason: `표에서 맞는 줄이 ${hits.length}개입니다.`, candidates: rows.slice(0, 10).map((r) => `${r.dongNm} ${r.hoNm}`) };
};

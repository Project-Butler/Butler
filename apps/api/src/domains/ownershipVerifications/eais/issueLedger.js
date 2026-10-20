// Created: 2026-10-21 04:33
// 세움터 건축물대장 1건 발급의 진입점. 브라우저 열기 → 로그인 → 발급 → 로그아웃 → 브라우저 닫기.
// 원본: eais-ledger src/cli.ts 의 runBrowser. 파일은 저장하지 않고 캡처한 쪽을 PNG Buffer로 돌려준다.
// 결과에는 실제 소유자 정보(성명·주민번호 앞자리·주소)가 그림으로 들어 있다. 로그·응답에 그대로 내보내지 않는다.
import { openSession } from './browser.js';
import { StopError, createContext, issueOnce, login, logout } from './eais.js';
import { parseTarget } from './issueCore.js';

// input: { address(지번 주소), dong, ho, buildingName, headless }
// 돌려주는 값:
//   성공 { status: 'ok', target, query, issuedAt, pages: [{ page, size, png }], totalPages, dialogs, humanSteps, autoFallbacks }
//   멈춤 { status: 'stopped', reason, candidates, ... } — 하나로 좁혀지지 않았거나 화면이 예상과 다름(사람이 확인할 일)
//   오류 { status: 'error', reason, ... }
// 입력이 잘못됐으면 { status: 'invalid', reason }을 돌려주고 세움터에 접속하지 않는다.
export const issueLedger = async ({ address, dong = null, ho = null, buildingName = null, headless = true }) => {
  const parsed = parseTarget({ address, dong, ho });
  if (typeof parsed === 'string') return { status: 'invalid', reason: parsed };
  const { target, query } = parsed;

  const id = process.env.EAIS_ID;
  const pw = process.env.EAIS_PW;
  if (!id || !pw) throw new Error('apps/api/.env 에 EAIS_ID·EAIS_PW 를 넣어 주세요(세움터 아이디 로그인).');

  const hint = {
    query,
    buildingName,
    show: [query, target.dong && `${target.dong}동`, target.ho && `${target.ho}호`].filter(Boolean).join(' '),
  };

  const session = await openSession({ headless });
  const ctx = createContext(session);
  const out = { target, query };
  try {
    await login(ctx, id, pw);
    Object.assign(out, await issueOnce(ctx, target, hint), { status: 'ok' });
  } catch (e) {
    const stop = e instanceof StopError;
    Object.assign(out, { status: stop ? 'stopped' : 'error', reason: e.message, candidates: stop ? e.candidates : [] });
  } finally {
    // 성공·실패 모두 로그아웃 후 브라우저를 닫는다(안 닫으면 node가 끝나지 않는다)
    await logout(ctx).catch(() => undefined);
    await session.close();
  }
  return { ...out, dialogs: ctx.dialogs, humanSteps: ctx.humanSteps, autoFallbacks: ctx.autoFallbacks };
};

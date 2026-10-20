// Created: 2026-10-21 04:33
// 로컬 확인용 CLI — 세움터 건축물대장 1건 발급. 결과는 콘솔에만 찍고 파일로 저장하지 않는다.
// 실행: npm run eais -w apps/api -- --address "<지번 주소>" [--dong <동>] [--ho <호>] [--name <건물명>] [--headless]
//   기본은 화면이 보이는 Chrome(캡차 등 사람 차례를 브라우저에서 직접 처리). --headless면 사람 차례에서 멈춘다.
// 실행할 때마다 세움터에 실제로 발급 1건이 신청된다.
import '../../../loadEnv.js';
import { issueLedger } from './issueLedger.js';

const FLAGS = ['address', 'dong', 'ho', 'name'];

// 인자 → { address, dong, ho, name, headless }, 잘못됐으면 오류 문구(string)
const parseArgs = (argv) => {
  const out = {};
  let headless = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--headless') {
      headless = true;
      continue;
    }
    const m = new RegExp(`^--(${FLAGS.join('|')})(?:=(.*))?$`).exec(argv[i]);
    if (!m) return `알 수 없는 인자: ${argv[i]}`;
    const v = m[2] ?? argv[++i];
    if (v === undefined || v.startsWith('--')) return `--${m[1]} 값이 없습니다.`;
    out[m[1]] = v.trim();
  }
  if (!out.address) return '--address 가 필요합니다.';
  return { address: out.address, dong: out.dong || null, ho: out.ho || null, name: out.name || null, headless };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args === 'string') {
    console.error(`[eais] ${args}`);
    return 2;
  }
  const result = await issueLedger({ address: args.address, dong: args.dong, ho: args.ho, buildingName: args.name, headless: args.headless });
  if (result.status === 'invalid') {
    console.error(`[eais] ${result.reason}`);
    return 2;
  }

  const t = result.target;
  console.info(`\n[eais] 대상: ${t.ledgerKind === 'GENERAL' ? '일반건축물대장' : '집합건축물대장 전유부'} · 검색어 「${result.query}」${t.dong ? ` · ${t.dong}동` : ''}${t.ho ? ` · ${t.ho}호` : ''}`);
  if (result.status === 'ok') {
    console.info(`[eais] 발급 완료 · ${result.issuedAt} · ${result.pages.length}쪽 (전체 ${result.totalPages ?? '알 수 없음'}쪽)`);
    result.pages.forEach((p) => console.info(`  ${p.page}쪽: ${p.size} · PNG ${p.png.length.toLocaleString()} bytes`));
  } else {
    console.info(`[eais] ${result.status === 'stopped' ? '멈춤' : '오류'}: ${result.reason}`);
    result.candidates.forEach((c, i) => console.info(`  ${i + 1}. ${c}`));
  }
  if (result.humanSteps.length) console.info(`[eais] 사람 차례 ${result.humanSteps.length}번`);
  if (result.autoFallbacks.length) console.info(`[eais] 자동 실패 후 사람에게 넘김: ${result.autoFallbacks.join(' / ')}`);
  return result.status === 'ok' ? 0 : result.status === 'stopped' ? 3 : 1;
};

// Windows·Node 24에서 fetch 소켓이 닫히는 중에 process.exit()를 부르면 libuv assertion으로 죽는다(2026-10-19 확인) → exitCode만 둔다
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(`[eais] 오류: ${e?.message ?? e}`);
    process.exitCode = 1;
  });

#!/usr/bin/env node
// 비밀값(.env, 키, 토큰)이 커밋/푸시되는 것을 막는다.
//   node scripts/secret-guard.mjs staged        pre-commit: 스테이징된 변경 검사
//   node scripts/secret-guard.mjs push <...>    pre-push: stdin으로 받은 푸시 대상 커밋 검사
// 오탐이면 해당 줄에 `secret-guard:allow` 주석을 달면 넘어간다.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ZERO_SHA = /^0+$/;
const ALLOW_MARKER = 'secret-guard:allow';

// 이름만으로 차단하는 파일. 예시 파일(.env.example 등)은 예외.
const BLOCKED_FILE_PATTERNS = [
  { re: /(^|\/)\.env(\..+)?$/, label: '.env 파일' },
  { re: /\.(pem|key|p12|pfx|jks|keystore)$/i, label: '개인키/인증서 파일' },
  { re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/, label: 'SSH 개인키' },
  { re: /(^|\/)\.(npmrc|pypirc|netrc)$/, label: '인증 정보 설정 파일' },
  { re: /(^|\/)(serviceAccount|service-account|firebase-adminsdk)[^/]*\.json$/i, label: '서비스 계정 JSON' },
  { re: /(^|\/)credentials\.json$/i, label: 'credentials.json' },
];
const ALLOWED_FILE_PATTERN = /(^|\/)\.env\.(example|sample|template)$/;

// 내용으로 차단하는 패턴 (추가된 줄만 검사)
const CONTENT_PATTERNS = [
  { re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/, label: '개인키 블록' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS Access Key' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, label: 'GitHub 토큰' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/, label: 'GitHub PAT' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, label: 'Slack 토큰' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, label: 'Google API Key' },
  { re: /\bsk_live_[0-9A-Za-z]{16,}\b/, label: 'Stripe live 시크릿 키' },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, label: 'Anthropic API Key' },
  { re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/, label: 'OpenAI API Key' },
  { re: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/, label: 'Supabase secret key' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, label: 'JWT (Supabase service_role 키 등)' },
  {
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/'"]+:([^\s@/'"]+)@/i,
    label: '비밀번호가 포함된 DB 접속 URL',
    valueGroup: 1,
  },
  {
    re: /(?:secret|token|passw(?:or)?d|api[_-]?key|private[_-]?key|access[_-]?key)\w*["']?\s*[:=]\s*["']([^"'\s]{12,})["']/i,
    label: '비밀값으로 보이는 문자열 할당',
    valueGroup: 1,
  },
];

// 값이 이런 모양이면 실제 비밀이 아니라 자리표시자로 본다.
const PLACEHOLDER = /^(?:<.*>|\$\{.*\}|\{\{.*\}\}|your[-_]|xxx|changeme|change[-_]me|example|placeholder|dummy|test|process\.env|.*\*{3,}|\.{3,})/i;

const SKIP_CONTENT_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|zip|xlsx?)$/i;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function blockedFileLabel(path) {
  if (ALLOWED_FILE_PATTERN.test(path)) return null;
  return BLOCKED_FILE_PATTERNS.find(({ re }) => re.test(path))?.label ?? null;
}

// `git diff -U0` 출력에서 파일별 추가된 줄만 뽑는다.
function parseAddedLines(diff) {
  const added = [];
  let file = null;
  let lineNo = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.startsWith('+++ b/') ? line.slice(6) : null;
    } else if (line.startsWith('@@')) {
      lineNo = Number(/\+(\d+)/.exec(line)?.[1] ?? 0) - 1;
    } else if (file && line.startsWith('+')) {
      lineNo += 1;
      added.push({ file, lineNo, text: line.slice(1) });
    }
  }
  return added;
}

function scanContent(added) {
  const findings = [];
  for (const { file, lineNo, text } of added) {
    if (SKIP_CONTENT_FILES.test(file) || text.includes(ALLOW_MARKER)) continue;
    for (const { re, label, valueGroup } of CONTENT_PATTERNS) {
      const match = re.exec(text);
      if (!match) continue;
      if (valueGroup && PLACEHOLDER.test(match[valueGroup])) continue;
      findings.push({ where: `${file}:${lineNo}`, reason: label });
      break;
    }
  }
  return findings;
}

function scanFileNames(paths) {
  return paths.flatMap((path) => {
    const label = blockedFileLabel(path);
    return label ? [{ where: path, reason: label }] : [];
  });
}

// .env가 .gitignore에서 빠져 있으면 add 단계에서 사고가 나기 쉽다.
function checkIgnoreRules() {
  const findings = [];
  for (const sample of ['.env', 'apps/api/.env', '.env.local']) {
    try {
      git(['check-ignore', '-q', sample]);
    } catch {
      findings.push({ where: '.gitignore', reason: `${sample} 가 ignore되지 않음` });
    }
  }
  return findings;
}

function collectStaged() {
  const names = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
    .split('\0')
    .filter(Boolean);
  const diff = git(['diff', '--cached', '-U0', '--no-color', '--diff-filter=ACMR']);
  return { names, added: parseAddedLines(diff) };
}

function hasCommit(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function readPushedRanges() {
  const lines = readFileSync(0, 'utf8').split('\n').filter(Boolean);
  const ranges = [];
  for (const line of lines) {
    const [, localSha, , remoteSha] = line.split(' ');
    if (!localSha || ZERO_SHA.test(localSha)) continue; // 브랜치 삭제 푸시
    // 새 브랜치이거나 원격 sha가 로컬에 없으면: 원격에 없는 커밋만
    const knownRemote = !ZERO_SHA.test(remoteSha) && hasCommit(remoteSha);
    ranges.push(knownRemote ? [`${remoteSha}..${localSha}`] : [localSha, '--not', '--remotes']);
  }
  return ranges;
}

function collectPushed() {
  const names = new Set();
  const added = [];
  for (const range of readPushedRanges()) {
    // 범위 내 모든 커밋이 건드린 파일 이름 (중간에 지워진 .env도 이력에 남으므로 잡는다)
    const touched = git(['log', ...range, '--diff-filter=ACMR', '--name-only', '--pretty=format:', '-z'])
      .split('\0')
      .map((s) => s.trim())
      .filter(Boolean);
    touched.forEach((n) => names.add(n));
    const diff = git(['log', ...range, '-p', '-U0', '--no-color', '--diff-filter=ACMR', '--pretty=format:']);
    added.push(...parseAddedLines(diff));
  }
  return { names: [...names], added };
}

function main() {
  const mode = process.argv[2];
  if (mode !== 'staged' && mode !== 'push') {
    console.error('usage: secret-guard.mjs <staged|push>');
    process.exit(2);
  }

  const { names, added } = mode === 'staged' ? collectStaged() : collectPushed();
  const findings = [
    ...(mode === 'staged' ? checkIgnoreRules() : []),
    ...scanFileNames(names),
    ...scanContent(added),
  ];

  if (findings.length === 0) return;

  const action = mode === 'staged' ? '커밋을' : '푸시를';
  console.error(`\n🚫 비밀값이 의심되어 ${action} 중단했습니다.\n`);
  for (const { where, reason } of findings) console.error(`  - ${where}  →  ${reason}`);
  console.error('\n조치 방법');
  if (mode === 'staged') {
    console.error('  • 스테이징에서 제거: git restore --staged <파일>');
  } else {
    console.error('  • 이미 커밋된 경우 이력에서 지운 뒤 푸시하세요 (git rebase -i / git commit --amend).');
    console.error('  • 이미 원격에 올라간 적 있다면 해당 키는 폐기하고 재발급하세요.');
  }
  console.error(`  • 오탐이면 해당 줄에 "${ALLOW_MARKER}" 주석을 추가하세요.\n`);
  process.exit(1);
}

main();

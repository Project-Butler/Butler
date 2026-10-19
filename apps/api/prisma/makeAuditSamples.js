// 단지 연결·동호 조회 감사(auditComplexMatching.js)용 고정 표본 100건을 로컬 kapt_complexes에서 뽑는다.
// 같은 DB·같은 시드면 같은 결과(결정적). 결과는 test-fixtures/complex-audit/samples.json에 커밋해 고정한다.
// 층화: 대단지(30) · 리 단위 법정동(20) · 서울/광역시(20) · 무작위(30). 이미 뽑힌 단지는 다음 층에서 건너뛴다.
// 대단지 기준: 이미 등록된 단지(complexes)에 household_count가 있으면 1,000세대 이상,
//   없는 단지는 K-apt 목록에 세대수가 없으므로 이름의 "N단지/N차/마을" 표기를 대리 지표로 쓴다(basis=name-hint).
// 실행: node prisma/makeAuditSamples.js [--seed 20261020] [--out test-fixtures/complex-audit/samples.json]
import '../src/loadEnv.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/platform/prismaClient.js';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
};

const SEED = Number(arg('seed', 20261020));
const OUT = path.resolve(arg('out', 'test-fixtures/complex-audit/samples.json'));
const STRATA = [
  ['large', 30],
  ['ri', 20],
  ['metro', 20],
  ['random', 30],
];
const METRO_SIDO = /^(서울|부산|대구|인천|광주|대전|울산)/;
const LARGE_NAME_HINT = /(\d+\s*(단지|차)|마을)/;

// mulberry32: 시드 고정 난수
const makeRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (pool, count, random, taken) => {
  const candidates = pool.filter((row) => !taken.has(row.kaptCode));
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, count);
};

const main = async () => {
  const rows = await prisma.$queryRaw`
    SELECT k.kapt_code AS "kaptCode", k.name, k.legal_dong_code AS "legalDongCode", k.sido_name AS "sidoName",
           c.household_count AS "householdCount"
    FROM kapt_complexes k
    LEFT JOIN complex_source_aliases a ON a.source_key = 'KAPT:' || k.kapt_code
    LEFT JOIN complexes c ON c.id = a.complex_id
    WHERE k.is_active = true
    ORDER BY k.kapt_code`;
  const pools = {
    large: rows
      .map((r) => ({ ...r, basis: r.householdCount >= 1000 ? 'household' : LARGE_NAME_HINT.test(r.name) && r.householdCount == null ? 'name-hint' : null }))
      .filter((r) => r.basis),
    ri: rows.filter((r) => !r.legalDongCode.endsWith('00')),
    metro: rows.filter((r) => METRO_SIDO.test(r.sidoName ?? '')),
    random: rows,
  };

  const random = makeRandom(SEED);
  const taken = new Set();
  const samples = [];
  for (const [stratum, count] of STRATA) {
    for (const row of pick(pools[stratum], count, random, taken)) {
      taken.add(row.kaptCode);
      samples.push({
        kaptCode: row.kaptCode,
        name: row.name,
        legalDongCode: row.legalDongCode,
        stratum,
        ...(stratum === 'large' ? { largeBasis: row.basis } : {}),
        truthSource: 'registry_expos', // 정답: 건축HUB 전유부 실제 호실(juso 건물 목록으로 찾은 필지)
      });
    }
  }

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ seed: SEED, samples }, null, 2)}\n`);
  const counts = Object.fromEntries(STRATA.map(([s]) => [s, samples.filter((x) => x.stratum === s).length]));
  console.info('[audit-samples]', { total: samples.length, ...counts, out: OUT });
};

main()
  .catch((error) => {
    console.error('[audit-samples] 실패:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

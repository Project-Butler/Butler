// 단지 연결(검색→KAPT 단지)·동호 조회(unit-info)를 실제 외부 API로 감사한다. 실행은 사람이 직접(쿼터 소모).
//   npm run audit:complex-matching -w apps/api -- [--samples path] [--limit N] [--interval-ms 1500]
//        [--out .omc/research/complex-audit] [--label run] [--date YYYY-MM-DD] [--base http://localhost:4000/api/v1]
//        [--kapt-limit 4500] [--keep] [--cleanup-only]
// 서버(`npm start`)를 따로 띄워 두고 실행한다. 사용자마다 걸리는 한도에 안 걸리도록 호출마다 임의 userId의 JWT를 쓴다.
//
// 1단계(검색): 단지를 KAPT 키로 resolve해 complexId를 얻은 뒤, 단지명·도로명주소·지번주소 3가지로 검색해
//   그 complexId(또는 KAPT 키)가 3순위 안에 있는지 본다. 같은 건물의 별도 PNU 항목은 정답으로 치지 않는다.
// 3단계(동호): 단지의 필지(최대 3)마다 건축HUB 전유부 호실 1개를 정답으로 골라, 사용자가 치는 형태
//   (동 '동' 없이, 호 '호' 없이)로 unit-info를 부르고 전용면적을 ±0.02㎡로 비교한다.
// 실패 사유: timeout / 429 / 503 / not_found_registry / ambiguous / name_mismatch / no_parcel / bug
//   - 정답을 만들지 못한 경우(not_found_registry: 대장에 전유 호실 없음, name_mismatch: juso에서 단지 건물을 못 찾음)는
//     우리 API 오류가 아니므로 비율 분모에서 뺀다(건수는 따로 보고). timeout·429·503도 분모에서 빼고 따로 센다.
//   - 검색: 결과 없음=no_parcel, 3순위 밖에서 발견=ambiguous, 결과는 있으나 정답 없음=name_mismatch
//   - 동호: 404=no_parcel, 200인데 면적 다름=ambiguous, 그 밖의 상태=bug
// K-apt 기본정보 호출은 서버(resolve)가 external_api_usage 카운터를 거쳐서만 쓴다. 이 스크립트는 직접 부르지 않고,
// 오늘 카운트가 --kapt-limit 이상이면 멈춘다(같은 명령을 다시 실행하면 이어 한다).
// 끝나면 감사가 만든 단지(별칭·조회 정보 포함)와 기존 단지에 붙은 별칭·조회 정보를 지운다(--keep이면 유지).
import '../src/loadEnv.js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { KAPT_BASIS_API, getApiUsage } from '../src/domains/complexes/apiUsage.js';
import { prisma } from '../src/platform/prismaClient.js';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const SAMPLES = path.resolve(arg('samples', 'test-fixtures/complex-audit/samples.json'));
const LIMIT = Number(arg('limit', Infinity));
const INTERVAL_MS = Number(arg('interval-ms', 1500));
const OUT_DIR = path.resolve(arg('out', '../../.omc/research/complex-audit'));
const LABEL = arg('label', 'run');
const DATE = arg('date', new Date().toISOString().slice(0, 10));
const BASE = arg('base', `http://localhost:${process.env.PORT ?? 4000}/api/v1`);
const KAPT_LIMIT = Number(arg('kapt-limit', 4500));
const OUT_FILE = path.join(OUT_DIR, `${DATE}-${LABEL}.json`);
const SUMMARY_FILE = path.join(OUT_DIR, `${DATE}-${LABEL}.summary.json`);
const CLIENT_TIMEOUT_MS = 30000;
const TOP_N = 3;
const AREA_TOLERANCE = 0.02;
const MAX_PARCELS = 3;
const INFRA_REASONS = new Set(['timeout', '429', '503']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastCallAt = 0;
const pace = async () => {
  const wait = lastCallAt + INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
};

// ---- 우리 API ----
const api = async (method, urlPath, body) => {
  await pace();
  const token = jwt.sign({ userId: randomUUID(), role: 'LANDLORD' }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
  const startedAt = Date.now();
  try {
    const response = await fetch(BASE + urlPath, {
      method,
      headers: { Cookie: `access_token=${token}`, 'X-Requested-With': 'butler-web', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, ms: Date.now() - startedAt, json };
  } catch (error) {
    return { status: 0, ms: Date.now() - startedAt, json: {}, timedOut: error.name === 'TimeoutError' || error.name === 'AbortError' };
  }
};

const infraReason = (res) => {
  if (res.timedOut) return 'timeout';
  if (res.status === 429) return '429';
  if (res.status === 503) return '503';
  return null;
};

// ---- 정답(juso + 건축HUB) ----
const normName = (s) => String(s ?? '').replace(/\s+/g, '').replace(/아파트|단지/g, '').toLowerCase();

const juso = async (keyword) => {
  await pace();
  const url = new URL('https://business.juso.go.kr/addrlink/addrLinkApi.do');
  url.search = new URLSearchParams({ confmKey: process.env.JUSO_API_KEY, keyword, currentPage: '1', countPerPage: '20', resultType: 'json' });
  try {
    const json = await (await fetch(url, { signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) })).json();
    return json.results?.juso ?? [];
  } catch {
    return [];
  }
};

const hubExpos = async (admCd, mtYn, bun, ji) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await pace();
    const url = new URL('https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo');
    url.search = new URLSearchParams({
      serviceKey: process.env.DATA_GO_KR_SERVICE_KEY,
      numOfRows: '100',
      pageNo: '1',
      _type: 'json',
      sigunguCd: admCd.slice(0, 5),
      bjdongCd: admCd.slice(5, 10),
      platGbCd: mtYn === '1' ? '1' : '0',
      bun: String(bun).padStart(4, '0'),
      ji: String(ji).padStart(4, '0'),
    });
    try {
      const json = JSON.parse(await (await fetch(url, { signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) })).text());
      return [].concat(json.response.body.items?.item || []);
    } catch {
      // 재시도
    }
  }
  return null;
};

// 단지의 정답 후보 필지: juso가 알려주는 같은 법정동의 공동주택 건물 중 이름이 겹치는 것(없으면 도로명주소 건물).
const findTruthLots = async (complex) => {
  const region = /^(.*?)\s(?:산\s?)?\d+(?:-\d+)?(?=\s|$)/.exec(complex.jibunAddress ?? '')?.[1];
  const sameDong = (row) => row.bdKdcd === '1' && `${row.admCd.slice(0, 8)}00` === complex.legalDongCode;
  const byName = [];
  for (const keyword of [region && `${region} ${complex.name}`, complex.roadAddress].filter(Boolean)) {
    for (const row of await juso(keyword)) {
      const a = normName(row.bdNm);
      const b = normName(complex.name);
      if (sameDong(row) && a && (a.includes(b) || b.includes(a))) byName.push(row);
    }
  }
  let rows = byName;
  if (rows.length === 0 && complex.roadAddress) rows = (await juso(complex.roadAddress)).filter(sameDong);
  const lots = new Map();
  for (const row of rows) lots.set(`${row.admCd}-${row.mtYn}-${row.lnbrMnnm}-${row.lnbrSlno}`, row);
  return [...lots.values()];
};

// ---- 1단계 ----
const searchStage = async (kind, query, kaptKey, complexId) => {
  if (!query || query.trim().length < 2) return { kind, skipped: 'no_query' };
  const res = await api('GET', `/complexes/search?${new URLSearchParams({ query, size: '20' })}`);
  const base = { kind, query, status: res.status, ms: res.ms };
  const infra = infraReason(res);
  if (infra) return { ...base, hit: false, reason: infra };
  if (res.status !== 200) return { ...base, hit: false, reason: 'bug', code: res.json.error?.code };
  const items = res.json.data ?? [];
  const index = items.findIndex((item) => item.complexId === complexId || item.sourceKey === kaptKey);
  const rank = index === -1 ? null : index + 1;
  const hit = rank !== null && rank <= TOP_N;
  let reason = null;
  if (!hit) reason = items.length === 0 ? 'no_parcel' : rank !== null ? 'ambiguous' : 'name_mismatch';
  return { ...base, n: items.length, rank, hit, reason, top: items.slice(0, TOP_N).map((item) => item.name) };
};

// ---- 3단계 ----
const unitStage = async (complex, lot) => {
  const lotLabel = `${lot.lnbrMnnm}-${lot.lnbrSlno}`;
  const items = await hubExpos(lot.admCd, lot.mtYn, lot.lnbrMnnm, lot.lnbrSlno);
  const units = (items ?? []).filter((x) => x.exposPubuseGbCdNm === '전유' && x.dongNm && x.hoNm);
  if (units.length === 0) return { lot: lotLabel, ok: null, reason: 'not_found_registry', hubDown: items === null };
  const unit = units[Math.floor(units.length / 2)];
  const query = new URLSearchParams({ buildingNo: String(unit.dongNm).replace(/동$/, ''), unitNo: String(unit.hoNm).replace(/호$/, '') });
  const res = await api('GET', `/complexes/${complex.id}/unit-info?${query}`);
  const base = { lot: lotLabel, dongNm: unit.dongNm, hoNm: unit.hoNm, truth: Number(unit.area), status: res.status, ms: res.ms };
  const infra = infraReason(res);
  if (infra) return { ...base, ok: false, reason: infra };
  if (res.status === 200) {
    const got = res.json.data?.exclusiveArea ?? null;
    const ok = got !== null && Math.abs(got - Number(unit.area)) < AREA_TOLERANCE;
    return { ...base, got, ok, reason: ok ? null : 'ambiguous' };
  }
  if (res.status === 404) return { ...base, ok: false, reason: 'no_parcel', code: res.json.error?.code };
  return { ...base, ok: false, reason: 'bug', code: res.json.error?.code };
};

// ---- 표본 하나 ----
const auditSample = async (sample, meta) => {
  const kaptKey = `KAPT:${sample.kaptCode}`;
  const result = { ...sample };
  const existed =
    (await prisma.complexSourceAlias.findUnique({ where: { sourceKey: kaptKey } })) ??
    (await prisma.complex.findUnique({ where: { sourceKey: kaptKey } }));

  const resolved = await api('POST', '/complexes/resolve', { sourceKey: kaptKey });
  result.resolve = { status: resolved.status, ms: resolved.ms };
  if (resolved.status !== 200) {
    result.resolve.reason = infraReason(resolved) ?? (resolved.status === 404 ? 'no_parcel' : 'bug');
    return result;
  }
  const complex = resolved.json.data;
  result.complexId = complex.id;
  result.preexisting = Boolean(existed);
  (existed ? meta.touchedComplexIds : meta.createdComplexIds).push(complex.id);

  result.stage1 = [
    await searchStage('name', complex.name, kaptKey, complex.id),
    await searchStage('road', complex.roadAddress, kaptKey, complex.id),
    await searchStage('jibun', complex.jibunAddress, kaptKey, complex.id),
  ];

  const lots = await findTruthLots(complex);
  result.stage3 = [];
  if (lots.length === 0) {
    result.stage3.push({ ok: null, reason: 'name_mismatch' });
  } else {
    result.lots = lots.length;
    for (const lot of lots.slice(0, MAX_PARCELS)) result.stage3.push(await unitStage(complex, lot));
  }
  return result;
};

// ---- 요약 ----
const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const latency = (values) => ({ n: values.length, p50: percentile(values, 50), p95: percentile(values, 95) });
const rate = (hit, total) => ({ hit, total, rate: total ? Number((hit / total).toFixed(4)) : null });

const summarize = (results) => {
  const reasons = {};
  const count = (reason) => {
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  };
  const stage1 = {};
  for (const kind of ['name', 'road', 'jibun']) {
    const rows = results.flatMap((r) => (r.stage1 ?? []).filter((s) => s.kind === kind && !s.skipped));
    const counted = rows.filter((s) => !INFRA_REASONS.has(s.reason));
    for (const row of rows.filter((s) => !s.hit)) count(`stage1:${row.reason}`);
    stage1[kind] = {
      ...rate(counted.filter((s) => s.hit).length, counted.length),
      infraFailures: rows.length - counted.length,
      skipped: results.filter((r) => r.stage1).length - rows.length,
    };
  }
  const allThree = results.filter((r) => r.stage1 && r.stage1.every((s) => !s.skipped && !INFRA_REASONS.has(s.reason)));
  stage1.allThree = rate(allThree.filter((r) => r.stage1.every((s) => s.hit)).length, allThree.length);

  const unitRows = results.flatMap((r) => r.stage3 ?? []);
  const noTruth = unitRows.filter((u) => u.ok === null);
  const asked = unitRows.filter((u) => u.ok !== null);
  const counted = asked.filter((u) => !INFRA_REASONS.has(u.reason));
  for (const row of noTruth) count(`stage3:${row.reason}`);
  for (const row of asked.filter((u) => !u.ok)) count(`stage3:${row.reason}`);
  for (const r of results.filter((x) => x.resolve?.reason)) count(`resolve:${r.resolve.reason}`);
  const stage3 = {
    ...rate(counted.filter((u) => u.ok).length, counted.length),
    infraFailures: asked.length - counted.length,
    noTruth: noTruth.length,
    bugOrNoParcel: counted.filter((u) => ['bug', 'no_parcel'].includes(u.reason)).length,
  };

  return {
    samples: results.length,
    stage1,
    stage3,
    reasons,
    latencyMs: {
      resolve: latency(results.map((r) => r.resolve?.ms).filter((x) => x != null)),
      search: latency(results.flatMap((r) => (r.stage1 ?? []).map((s) => s.ms)).filter((x) => x != null)),
      unitInfo: latency(asked.map((u) => u.ms).filter((x) => x != null)),
    },
  };
};

// ---- 정리 ----
const cleanup = async (meta) => {
  const created = [...new Set(meta.createdComplexIds)];
  const touched = [...new Set(meta.touchedComplexIds)];
  const since = new Date(meta.runStart);
  // 감사가 만든 단지는 지운다(별칭·동 조회·음성 캐시는 cascade). 호실(Property)이 붙은 단지는 남긴다.
  const removed = await prisma.complex.deleteMany({ where: { id: { in: created }, properties: { none: {} } } });
  // 원래 있던 단지에 감사 중 생긴 별칭·동 조회·음성 캐시만 지운다.
  const aliases = await prisma.complexSourceAlias.deleteMany({ where: { complexId: { in: touched }, createdAt: { gte: since } } });
  const lookups = await prisma.complexBuildingLookup.deleteMany({ where: { complexId: { in: touched }, verifiedAt: { gte: since } } });
  const misses = await prisma.complexLookupMiss.deleteMany({ where: { complexId: { in: touched }, expiresAt: { gt: since } } });
  console.info('[audit] 정리', { complexes: removed.count, aliases: aliases.count, lookups: lookups.count, misses: misses.count });
  meta.createdComplexIds = [];
  meta.touchedComplexIds = [];
};

const save = (data) => {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(data, null, 1)}\n`);
};

const main = async () => {
  const data = existsSync(OUT_FILE)
    ? JSON.parse(readFileSync(OUT_FILE, 'utf8'))
    : { meta: { runStart: new Date().toISOString(), createdComplexIds: [], touchedComplexIds: [] }, results: [] };
  if (flag('cleanup-only')) {
    await cleanup(data.meta);
    save(data);
    return;
  }

  const { samples } = JSON.parse(readFileSync(SAMPLES, 'utf8'));
  const done = new Set(data.results.map((r) => r.kaptCode));
  let ran = 0;
  for (const sample of samples) {
    if (done.has(sample.kaptCode)) continue;
    if (ran >= LIMIT) break;
    const usage = await getApiUsage(prisma, KAPT_BASIS_API);
    if (usage >= KAPT_LIMIT) {
      console.warn(`[audit] K-apt 기본정보 오늘 ${usage}회 >= ${KAPT_LIMIT} — 멈춥니다(같은 명령을 다시 실행하면 이어 합니다).`);
      break;
    }
    data.results.push(await auditSample(sample, data.meta));
    ran += 1;
    save(data);
    console.info(`[audit] ${data.results.length}/${samples.length} ${sample.kaptCode} ${sample.name}`);
  }

  if (!flag('keep')) await cleanup(data.meta);
  save(data);
  const summary = summarize(data.results);
  writeFileSync(SUMMARY_FILE, `${JSON.stringify(summary, null, 2)}\n`);
  console.info(JSON.stringify(summary, null, 2));
  console.info(`[audit] 결과 ${OUT_FILE}`);
};

main()
  .catch((error) => {
    console.error('[audit] 실패:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

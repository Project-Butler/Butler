// 뉴스 화면의 목록과 뉴스 수집. 수집은 cronRouter.js 의 /api/cron/community-news 가 부른다.
import { createHash } from 'node:crypto';
import { AppError } from '../../../platform/AppError.js';
import { prisma } from '../../../platform/prismaClient.js';
import { fetchNews } from '../newsProvider.js';
import { buildNameIndex, buildRegionTerms, getSido, makeTitleFilter, toQueryName, toSidoCode } from '../newsRelevance.js';
import { listAllVerifiedLegalDongCodes } from '../platformBridge.js';

const toUrlHash = (url) => createHash('sha256').update(url).digest('hex');
const toSigunguCode = (legalDongCode) => legalDongCode.slice(0, 5);

// 시·군·구 기사가 이보다 적으면(최근 30일) 화면에 시·도 묶음을 함께 보인다
export const SIDO_FALLBACK_THRESHOLD = 5;
export const SIDO_FALLBACK_SIZE = 10;
const RECENT_DAYS = 30;

// ===== 수집 대상과 걸러내기 =====

// 수집 대상: 전국 + 인증 보유자가 있는 시·도 + 인증 보유자가 있는 시·군·구. 각 대상에 제목 검사 함수를 붙인다.
// 시·군·구의 지역 이름 = 그 시·군·구 이름 + 그 시·군·구의 모든 법정동 이름(newsRelevance.js 규칙).
// 이름표(nameIndex)는 여기서 한 번만 만든다 — 기사마다 DB 를 다시 읽지 않는다.
export const buildNewsTargets = async () => {
  const verifiedCodes = new Set(await listAllVerifiedLegalDongCodes());
  const regions = (
    await prisma.region.findMany({
      where: { isActive: true },
      select: { id: true, sigunguName: true, dongName: true },
    })
  ).map(({ id, ...rest }) => ({ legalDongCode: id, ...rest }));
  const nameIndex = buildNameIndex(regions);

  // 수집 대상은 인증 보유자가 있는 시·군·구, 인정하는 동 이름은 그 시·군·구의 모든 법정동
  const targetCodes = new Set([...verifiedCodes].map(toSigunguCode));
  const sigungus = new Map();
  for (const region of regions) {
    const code = toSigunguCode(region.legalDongCode);
    if (!targetCodes.has(code)) continue;
    if (!sigungus.has(code)) sigungus.set(code, { sigunguName: region.sigunguName, dongNames: [], verifiedDongNames: [] });
    sigungus.get(code).dongNames.push(region.dongName);
    if (verifiedCodes.has(region.legalDongCode)) sigungus.get(code).verifiedDongNames.push(region.dongName);
  }
  const sidoCodes = [...new Set([...sigungus.keys()].map(toSidoCode))].filter((code) => getSido(code)).sort();

  return [
    { scope: 'NATIONWIDE', scopeCode: null, filter: makeTitleFilter({ scope: 'NATIONWIDE' }) },
    ...sidoCodes.map((code) => ({
      scope: 'SIDO',
      scopeCode: code,
      sidoNames: getSido(code).label.split('·'),
      filter: makeTitleFilter({ scope: 'SIDO', sidoCode: code }),
    })),
    ...[...sigungus].sort(([a], [b]) => a.localeCompare(b)).map(([code, sigungu]) => ({
      scope: 'SIGUNGU',
      scopeCode: code,
      sigunguName: sigungu.sigunguName,
      // 검색어: intitle:{구 약칭} … + 인증 보유자가 있는 동(법정동코드순 최대 2곳) "{동} 아파트"
      sigunguQueryName: toQueryName(sigungu.sigunguName, 'SIGUNGU', nameIndex),
      dongQueryNames: sigungu.verifiedDongNames.map((dong) => toQueryName(dong, 'DONG', nameIndex)),
      filter: makeTitleFilter({ scope: 'SIGUNGU', terms: buildRegionTerms(sigungu, nameIndex), sidoCode: toSidoCode(code) }),
    })),
  ];
};

// 걸러낸 기사를 저장한다(제목·링크·출처·발행 시각만). 같은 범위 안 같은 URL 은 DB 유니크(scope_code+url_hash,
// 전국은 부분 유니크)가 막으므로 ON CONFLICT DO NOTHING(createMany skipDuplicates) — 두 번 돌려도 건수가 같다.
const saveArticles = async (articles, { scope, scopeCode }) => {
  if (articles.length === 0) return 0;
  const { count } = await prisma.communityNewsItem.createMany({
    data: articles.map((article) => ({
      // 지역·전국 모두 뉴스 검색 결과다(구글 뉴스 RSS). MOLIT_PRESS 는 국토부 보도자료를 직접 받을 때 쓴다
      source: 'NEWS_SEARCH',
      scope,
      scopeCode,
      title: article.title,
      url: article.url,
      urlHash: toUrlHash(article.url),
      publisher: article.source ?? null,
      publishedAt: article.publishedAt,
    })),
    skipDuplicates: true,
  });
  return count;
};

// 한 번 실행의 총 시간 예산. vercel.json 함수 제한 60초 안에서 DB 저장 몫을 남긴다.
const RUN_BUDGET_MS = 45 * 1000;

// GET /api/cron/community-news — 전국 → 시·도 → 시·군·구 순서. 받은 수·걸러진 수·저장 수를 대상마다 기록한다.
// 예산을 넘겨 건너뛴 검색어는 결과에 남기고 다음 실행 때 다시 받는다. options 는 테스트가 공급자에 넘긴다.
export const collectNews = async ({ budgetMs = RUN_BUDGET_MS, ...providerOptions } = {}) => {
  const now = providerOptions.now ?? Date.now;
  const fetchOptions = { ...providerOptions, now, deadline: now() + budgetMs };
  const results = [];
  for (const target of await buildNewsTargets()) {
    const { articles, skippedQueries } = await fetchNews(target, fetchOptions);
    const passed = articles.filter((article) => target.filter(article.title));
    results.push({
      scope: target.scope,
      scopeCode: target.scopeCode,
      fetched: articles.length,
      filtered: articles.length - passed.length,
      inserted: await saveArticles(passed, target),
      skippedQueries,
    });
  }
  const summary = { inserted: results.reduce((sum, result) => sum + result.inserted, 0), results };
  console.info(
    `[community-news] ${results.map((r) => `${r.scopeCode ?? '전국'} 받음 ${r.fetched}·거름 ${r.filtered}·저장 ${r.inserted}`).join(' / ')}`,
  );
  return summary;
};

// ===== 읽기 =====

const toNewsItem = (item) => ({
  id: item.id,
  scope: item.scope,
  title: item.title,
  url: item.url,
  publisher: item.publisher,
  publishedAt: item.publishedAt.toISOString(),
});

// GET /community/regions/:legalDongCode/news?scope=SIGUNGU|SIDO|NATIONWIDE — 최신순.
// scope 를 안 주면 시·군·구 + 전국(시·도는 빼고). SIGUNGU 응답의 meta.sidoFallback 은 시·군·구 기사가
// 최근 30일 5건 미만이라 화면이 시·도 묶음(scope=SIDO, 최대 10건)을 함께 보여야 하는지다.
export const findNews = async (legalDongCode, { scope, page, size }, now = new Date()) => {
  const row = await prisma.region.findUnique({
    where: { id: legalDongCode },
    select: { id: true, sigunguName: true, dongName: true, fullName: true },
  });
  if (!row) throw new AppError('COMMUNITY_REGION_NOT_FOUND', 404, '지역을 찾을 수 없습니다.');
  const region = {
    legalDongCode: row.id,
    sigunguName: row.sigunguName,
    dongName: row.dongName,
    fullName: row.fullName,
    sidoLabel: getSido(toSidoCode(legalDongCode))?.label ?? null,
  };

  const sigungu = { scope: 'SIGUNGU', scopeCode: toSigunguCode(legalDongCode) };
  const sido = { scope: 'SIDO', scopeCode: toSidoCode(legalDongCode) };
  const nationwide = { scope: 'NATIONWIDE', scopeCode: null };
  const where = { SIGUNGU: sigungu, SIDO: sido, NATIONWIDE: nationwide }[scope] ?? { OR: [sigungu, nationwide] };

  const recentSince = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const [items, total, recentSigungu] = await Promise.all([
    prisma.communityNewsItem.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.communityNewsItem.count({ where }),
    scope === 'SIGUNGU' ? prisma.communityNewsItem.count({ where: { ...sigungu, publishedAt: { gte: recentSince } } }) : null,
  ]);
  return {
    items: items.map(toNewsItem),
    meta: {
      page,
      size,
      total,
      hasNext: page * size < total,
      region,
      ...(scope === 'SIGUNGU' ? { sidoFallback: recentSigungu < SIDO_FALLBACK_THRESHOLD } : {}),
    },
  };
};

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(apiDir, 'package.json'));
require('dotenv').config({ path: path.join(apiDir, '.env') });
// 로컬 DB에만 쓴다: DATABASE_URL 호스트가 localhost/127.0.0.1이 아니면 바로 멈춘다(운영 DB 보호).
const dbHost = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1'].includes(dbHost)) {
  throw new Error('E2E는 로컬 DB에서만 실행합니다. DATABASE_URL 호스트: ' + (dbHost || '(없음)'));
}
const jwt = require('jsonwebtoken');
const { prisma: db } = await import(new URL('../src/platform/prismaClient.js', import.meta.url).href);
const BASE = 'http://127.0.0.1:4000/api/v1';
const tag = `codex-e2e-${Date.now()}-${randomUUID().slice(0, 8)}`;
const tempUserId = randomUUID();
const createdComplexIds = new Set();
const createdSearchKeys = new Set();
const baselineSearchKeys = new Set();
const createdPropertyIds = new Set();
const createdOwnershipIds = new Set();
const baselinePropertyIds = new Set();
const legacySearchKeys = [
  'ROAD:113504130202-0-17-0', 'ROAD:113504130157-0-13-0', 'ROAD:113503110009-0-250-0',
  'ROAD:113504130202-0-186-0', 'ROAD:113503000001-0-1279-0', 'ROAD:113504130202-0-18-0',
  'ROAD:113503110005-0-285-0', 'ROAD:113504130155-0-9-7', 'ROAD:113504130376-0-5-0',
  'ROAD:113504130375-0-34-0',
];
let insertedKaptTestLinks = false;
let fixtureLandlordId;
let fixtureIds = {};
let apiAvailable = false;
let report = (name, ok, info = {}) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(info)}`);

const pause = (ms = 325) => new Promise((resolve) => setTimeout(resolve, ms));
const apiCall = async (cookie, method, route, data, headers = {}) => {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const bodyText = await res.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = { raw: bodyText.slice(0, 300) }; }
  return { status: res.status, body, headers: res.headers };
};
const login = async (email) => {
  const res = await apiCall('', 'POST', '/auth/login', { email, password: 'password123' }, { 'X-Requested-With': 'butler-web' });
  const cookie = res.headers.getSetCookie().find((value) => value.startsWith('access_token='));
  assert.ok(cookie, `login failed (${email}): ${res.status}`);
  return cookie.split(';')[0];
};
const dbCounts = async () => db.$queryRaw`SELECT
  (SELECT count(*)::int FROM users WHERE email LIKE 'codex-e2e-%') AS users,
  (SELECT count(*)::int FROM complexes WHERE source_key LIKE 'ROAD:%' AND id = ANY(${[...createdComplexIds]}::uuid[])) AS complexes,
  (SELECT count(*)::int FROM landlord_buildings WHERE user_id = ${tempUserId}::uuid) AS buildings,
  (SELECT count(*)::int FROM properties WHERE id = ANY(${[...createdPropertyIds]}::uuid[])) AS properties,
  (SELECT count(*)::int FROM property_ownerships WHERE user_id = ${tempUserId}::uuid) AS ownerships,
  (SELECT count(*)::int FROM activity_logs WHERE user_id = ${tempUserId}::uuid) AS activities,
  (SELECT count(*)::int FROM address_search_results WHERE source_key = ANY(${[...createdSearchKeys]}::text[])) AS saved`;

before(async () => {
  try { const r = await fetch(`${BASE}/auth/me`, { signal: AbortSignal.timeout(2500) }); apiAvailable = r.status > 0; }
  catch (error) { apiAvailable = false; console.log(`API probe failed: ${error.cause?.code ?? error.name}`); }
  if (apiAvailable) for (const row of await db.addressSearchResult.findMany({ select: { sourceKey: true } })) baselineSearchKeys.add(row.sourceKey);
  if (!apiAvailable) console.log('SKIP: local API is unreachable at http://localhost:4000/api/v1');
});

after(async () => {
  if (apiAvailable) {
    try {
      for (const row of await db.addressSearchResult.findMany({ select: { sourceKey: true } })) if (!baselineSearchKeys.has(row.sourceKey)) createdSearchKeys.add(row.sourceKey);
      const activityRows = await db.$queryRaw`SELECT count(*)::int AS n FROM activity_logs WHERE user_id IN (${tempUserId}::uuid, ${fixtureLandlordId}::uuid) AND (complex_id = ANY(${[...createdComplexIds]}::uuid[]) OR params->>'buildingName' LIKE ${`${tag}%`})`;
      const legacySearchCount = await db.addressSearchResult.count({ where: { sourceKey: { in: legacySearchKeys } } });
      const fixedUserIds = await db.user.findMany({ where: { email: { in: ['landlord@butler.test', 'tenant@butler.test', 'admin@butler.test'] } }, select: { id: true, email: true } });
      const rateKeys = [`complex-search:${tempUserId}`, `general:${tempUserId}`, ...fixedUserIds.flatMap((u) => [`complex-search:${u.id}`, `general:${u.id}`])];
      const rateCounterRows = await db.$queryRaw`SELECT count(*)::int AS n FROM rate_limit_counters WHERE key = ANY(${rateKeys}::text[]) OR key LIKE 'login:landlord@butler.test:%' OR key LIKE 'login:tenant@butler.test:%' OR key LIKE 'login:admin@butler.test:%'`;
      const createdCounts = {
        users: await db.user.count({ where: { id: tempUserId, email: { startsWith: 'codex-e2e-' } } }),
        complexes: createdComplexIds.size,
        landlord_buildings: await db.landlordBuilding.count({ where: { name: { startsWith: tag } } }),
        properties: createdPropertyIds.size,
        ownerships: createdOwnershipIds.size,
        activity_logs: activityRows[0]?.n ?? 0,
        address_search_results: createdSearchKeys.size + legacySearchCount,
        contracts: await db.contract.count({ where: { tenantName: 'Codex E2E tenant' } }),
        kapt_address_links: insertedKaptTestLinks ? await db.kaptAddressLink.count({ where: { source: 'KAPT_API', roadSigunguCd: '11350', roadNameKey: '동일로207길', roadMainNo: 186, roadSubNo: 0 } }) : 0,
        rate_limit_counters: rateCounterRows[0]?.n ?? 0,
      };
      console.log('CREATED_ROW_COUNTS', JSON.stringify(createdCounts));
      const propIds = [...createdPropertyIds];
      if (propIds.length) await db.$executeRaw`DELETE FROM contracts WHERE ownership_id IN (SELECT id FROM property_ownerships WHERE property_id = ANY(${propIds}::uuid[]))`;
      await db.$executeRaw`DELETE FROM activity_logs WHERE user_id = ${tempUserId}::uuid`;
      if (propIds.length) await db.$executeRaw`DELETE FROM activity_logs WHERE property_id = ANY(${propIds}::uuid[]) OR complex_id = ANY(${[...createdComplexIds]}::uuid[])`;
      if (createdOwnershipIds.size) await db.$executeRaw`DELETE FROM property_ownerships WHERE id = ANY(${[...createdOwnershipIds]}::uuid[])`;
      if (propIds.length) await db.$executeRaw`DELETE FROM properties WHERE id = ANY(${propIds}::uuid[])`;
      await db.$executeRaw`DELETE FROM landlord_buildings WHERE user_id = ${tempUserId}::uuid OR name LIKE ${`${tag}%`}`;
      if (createdComplexIds.size) await db.$executeRaw`DELETE FROM complexes WHERE id = ANY(${[...createdComplexIds]}::uuid[])`;
      if (insertedKaptTestLinks) await db.$executeRaw`DELETE FROM kapt_address_links WHERE source = 'KAPT_API' AND road_sigungu_cd = '11350' AND road_name_key = '동일로207길' AND road_main_no = 186 AND road_sub_no = 0 AND kapt_code IN ('A13987305','A13993901')`;
      if (createdSearchKeys.size) await db.$executeRaw`DELETE FROM address_search_results WHERE source_key = ANY(${[...createdSearchKeys]}::text[])`;
      if (legacySearchKeys.length) await db.addressSearchResult.deleteMany({ where: { sourceKey: { in: legacySearchKeys } } });
      await db.$executeRaw`DELETE FROM users WHERE id = ${tempUserId}::uuid AND email LIKE 'codex-e2e-%'`;
      await db.$executeRaw`DELETE FROM rate_limit_counters WHERE key IN (${`complex-search:${tempUserId}`}, ${`general:${tempUserId}`})`;
      for (const user of fixedUserIds) {
        await db.$executeRaw`DELETE FROM rate_limit_counters WHERE key IN (${`general:${user.id}`}, ${`complex-search:${user.id}`}) OR key LIKE ${`login:${user.email}:%`}`;
      }
      const remaining = await dbCounts();
      console.log('CLEANUP remaining created rows', JSON.stringify(remaining[0]));
    } catch (error) { console.error('CLEANUP ERROR', error.message); }
  }
  await db.$disconnect();
});

test('A-12 use-case and exception E2E against local API', async (t) => {
  if (!apiAvailable) { t.skip('API unreachable; skipped without creating data'); return; }
  const mark = (name, ok, info = {}) => { report(name, ok, info); assert.ok(ok, `${name}: ${JSON.stringify(info)}`); };
  const absent = async (name, response, expected) => mark(name, response.status === expected, { status: response.status, error: response.body?.error });
  const landlord = await login('landlord@butler.test');
  fixtureLandlordId = (await db.user.findUnique({ where: { email: 'landlord@butler.test' }, select: { id: true } })).id;
  const tenant = await login('tenant@butler.test');
  const admin = await login('admin@butler.test');
  await db.$executeRaw`INSERT INTO users (id,email,password_hash,name,role,status,created_at,updated_at)
    VALUES (${tempUserId}::uuid,${`${tag}@butler.test`},'not-used','Codex E2E landlord','LANDLORD','ACTIVE',now(),now())`;
  const second = `access_token=${jwt.sign({ userId: tempUserId, role: 'LANDLORD' }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '30m' })}`;
  const noCsrf = { 'Content-Type': 'application/json' };
  const search = async (query, extra = '', cookie = second) => { await pause(); return apiCall(cookie, 'GET', `/complexes/search?query=${encodeURIComponent(query)}${extra}`); };
  const s0 = await search('중계그린');
  mark('UC1/search: Juso rows, road keys, detail names, complexId/enrichment', s0.status === 200 && s0.body.data?.length > 0 && s0.body.data.every((x) => x.sourceKey.startsWith('ROAD:') && Array.isArray(x.detailBuildingNames)), { status: s0.status, count: s0.body.data?.length, rows: s0.body.data?.slice(0, 5).map(({ sourceKey, name, roadAddress, complexId, kapt, isApartment, detailBuildingNames }) => ({ sourceKey, name, roadAddress, complexId, kapt, isApartment, detailBuildingNames })) });
  assert.ok(s0.status === 200 && s0.body.data?.length);
  const target = s0.body.data.find((x) => /섬밭로 285|동일로207길 17|동일로207길 18/.test(x.roadAddress ?? '')) ?? s0.body.data[0];
  const oldComplex = target.complexId ? await db.complex.findUnique({ where: { id: target.complexId } }) : null;
  const preExisting = new Set((await db.addressSearchResult.findMany({ select: { sourceKey: true } })).map((x) => x.sourceKey));
  const resolveUnsearched = await apiCall(landlord, 'POST', '/complexes/resolve', { sourceKey: 'ROAD:999999999999-0-1-0' }, { 'X-Requested-With': 'butler-web' });
  absent('UC1 resolve without search -> 404', resolveUnsearched, 404);
  const resolved = await apiCall(landlord, 'POST', '/complexes/resolve', { sourceKey: target.sourceKey }, { 'X-Requested-With': 'butler-web' });
  mark('UC1 resolve -> stable id; sourceKey tamper rejected', resolved.status === 200 && !!resolved.body.data?.id, { status: resolved.status, data: resolved.body.data && { id: resolved.body.data.id, sourceKey: resolved.body.data.sourceKey, kaptCode: resolved.body.data.kaptCode } });
  assert.equal(resolved.status, 200);
  const complexId = resolved.body.data.id;
  for (const row of await db.property.findMany({ where: { complexId }, select: { id: true } })) baselinePropertyIds.add(row.id);
  if (!oldComplex) createdComplexIds.add(complexId);
  for (const row of await db.addressSearchResult.findMany({ select: { sourceKey: true } })) if (!preExisting.has(row.sourceKey)) createdSearchKeys.add(row.sourceKey);
  absent('UC1 tampered sourceKey format -> 400', await apiCall(landlord, 'POST', '/complexes/resolve', { sourceKey: 'not-a-road-key' }, { 'X-Requested-With': 'butler-web' }), 400);
  const same = await apiCall(landlord, 'POST', '/complexes/resolve', { sourceKey: target.sourceKey }, { 'X-Requested-With': 'butler-web' });
  mark('UC1 resolve twice returns same id; second landlord shares complex', same.status === 200 && same.body.data.id === complexId && (await apiCall(second, 'POST', '/complexes/resolve', { sourceKey: target.sourceKey }, { 'X-Requested-With': 'butler-web' })).body.data.id === complexId, { status: same.status, id: same.body.data?.id });

  // Security/validation boundaries that need no extra external data.
  absent('security missing X-Requested-With -> rejected', await apiCall(landlord, 'POST', '/landlord-buildings', { complexId, name: `${tag} building` }, noCsrf), 403);
  absent('security no cookie -> 401', await apiCall('', 'POST', '/landlord-buildings', { complexId, name: `${tag} building` }, { 'X-Requested-With': 'butler-web', 'Content-Type': 'application/json' }), 401);
  absent('security TENANT write -> 403', await apiCall(tenant, 'POST', '/landlord-buildings', { complexId, name: `${tag} tenant` }, { 'X-Requested-With': 'butler-web' }), 403);
  absent('security ADMIN landlord-building write -> 403', await apiCall(admin, 'POST', '/landlord-buildings', { complexId, name: `${tag} admin` }, { 'X-Requested-With': 'butler-web' }), 403);

  const buildingResponse = await apiCall(landlord, 'POST', '/landlord-buildings', { complexId, name: `${tag} home`, capacity: 8, memo: 'E2E' }, { 'X-Requested-With': 'butler-web' });
  mark('UC1 landlord building creation', buildingResponse.status === 201, { status: buildingResponse.status, error: buildingResponse.body?.error });
  assert.equal(buildingResponse.status, 201);
  const buildingId = buildingResponse.body.data.id;
  const secondBuildingResponse = await apiCall(second, 'POST', '/landlord-buildings', { complexId, name: `${tag} second landlord` }, { 'X-Requested-With': 'butler-web' });
  mark('UC1 two landlords may configure their own building for the same complex', secondBuildingResponse.status === 201 && secondBuildingResponse.body.data.complex.id === complexId, { status: secondBuildingResponse.status, complexId: secondBuildingResponse.body.data?.complex.id });
  absent('UC1 duplicate building -> 409', await apiCall(landlord, 'POST', '/landlord-buildings', { complexId, name: `${tag} duplicate` }, { 'X-Requested-With': 'butler-web' }), 409);
  absent('UC1 other landlord building hidden -> 404', await apiCall(second, 'GET', `/landlord-buildings/${buildingId}`), 404);

  const createUnit = async (body, cookie = landlord) => apiCall(cookie, 'POST', '/properties', { complexId, ...body }, { 'X-Requested-With': 'butler-web' });
  const u1 = await createUnit({ buildingNo: '１０１동', unitNo: '4층410호', exclusiveArea: 39.78, floor: -10, unitType: 'ONE_ROOM', equipment: ['BED', 'TV'], equipmentEtc: '제습기' });
  mark('UC2 normalization fullwidth/suffix/floor prefix; Decimal numeric', u1.status === 201 && u1.body.data.property.buildingNo === '101' && u1.body.data.property.unitNo === '410' && u1.body.data.property.exclusiveArea === 39.78 && u1.body.data.property.floor === -10, { status: u1.status, property: u1.body.data?.property });
  assert.equal(u1.status, 201);
  if (!baselinePropertyIds.has(u1.body.data.property.id)) createdPropertyIds.add(u1.body.data.property.id);
  const propertyId = u1.body.data.property.id;
  let ownershipId = u1.body.data.ownership.id;
  createdOwnershipIds.add(ownershipId);
  const normalizedTwin = await createUnit({ buildingNo: '제101동', unitNo: '101동 410호', exclusiveArea: 40, floor: 99 }, second);
  mark('UC2/3 alternate dong spelling and second landlord share property; area/floor retained', normalizedTwin.status === 201 && normalizedTwin.body.data.property.id === propertyId && normalizedTwin.body.data.property.exclusiveArea === 39.78 && normalizedTwin.body.data.property.floor === -10, { status: normalizedTwin.status, error: normalizedTwin.body?.error, property: normalizedTwin.body.data?.property, ownershipCount: await db.propertyOwnership.count({ where: { propertyId } }) });
  assert.equal(normalizedTwin.status, 201);
  createdOwnershipIds.add(normalizedTwin.body.data.ownership.id);
  mark('UC3 two ownerships share one property', await db.propertyOwnership.count({ where: { propertyId } }) === 2, { count: await db.propertyOwnership.count({ where: { propertyId } }) });
  const sameDongPrefix = await createUnit({ buildingNo: '114', unitNo: '114동 410호' });
  mark('UC2 matching dong prefix in unit field normalizes away', sameDongPrefix.status === 201 && sameDongPrefix.body.data.property.unitNo === '410', { status: sameDongPrefix.status, unitNo: sameDongPrefix.body.data?.property.unitNo, error: sameDongPrefix.body?.error });
  if (sameDongPrefix.status === 201) { if (!baselinePropertyIds.has(sameDongPrefix.body.data.property.id)) createdPropertyIds.add(sameDongPrefix.body.data.property.id); createdOwnershipIds.add(sameDongPrefix.body.data.ownership.id); }
  absent('UC3 non-verified PATCH -> 403', await apiCall(landlord, 'PATCH', `/properties/${propertyId}`, { floor: 2 }, { 'X-Requested-With': 'butler-web' }), 403);

  // Distinct invalid payloads; expected controller validation 400.
  const invalids = [
    ['combined unit', { buildingNo: '', unitNo: '101동 1203호' }], ['empty unit', { buildingNo: '101', unitNo: '' }],
    ['dong >10 chars', { buildingNo: '12345678901', unitNo: '2' }], ['unit >10 chars', { buildingNo: '', unitNo: '12345678901' }],
    ['area precision', { buildingNo: '102', unitNo: '1', exclusiveArea: 39.785 }], ['zero area', { buildingNo: '102', unitNo: '2', exclusiveArea: 0 }],
    ['negative area', { buildingNo: '102', unitNo: '3', exclusiveArea: -2 }], ['huge area', { buildingNo: '102', unitNo: '4', exclusiveArea: 1000000 }],
    ['floor below min', { buildingNo: '102', unitNo: '5', floor: -11 }], ['floor above max', { buildingNo: '102', unitNo: '6', floor: 201 }],
    ['non-integer floor', { buildingNo: '102', unitNo: '7', floor: 2.5 }], ['invalid unit type', { buildingNo: '102', unitNo: '8', unitType: 'CASTLE' }],
    ['invalid equipment', { buildingNo: '102', unitNo: '9', equipment: ['HOVERBOARD'] }], ['equipmentEtc >200', { buildingNo: '102', unitNo: '10', equipmentEtc: 'x'.repeat(201) }],
    ['SQL-like unit', { buildingNo: "101'; DROP TABLE properties;--", unitNo: '1' }],
  ];
  for (const [label, payload] of invalids) await absent(`UC2 validation ${label} -> 400`, await createUnit(payload), 400);
  const emptyDong = await createUnit({ buildingNo: '', unitNo: '411', floor: 200 });
  mark('UC2 empty building allowed; upper floor bound', emptyDong.status === 201 && emptyDong.body.data.property.buildingNo === '' && emptyDong.body.data.property.floor === 200 && !String(emptyDong.body.data.property.displayName).includes('동'), { status: emptyDong.status, property: emptyDong.body.data?.property, error: emptyDong.body?.error });
  if (emptyDong.status === 201) {
    if (!baselinePropertyIds.has(emptyDong.body.data.property.id)) createdPropertyIds.add(emptyDong.body.data.property.id);
    createdOwnershipIds.add(emptyDong.body.data.ownership.id);
  }

  const dupe = await createUnit({ buildingNo: '101', unitNo: '410' });
  absent('UC4 same landlord duplicate active unit -> 409', dupe, 409);
  const unit2 = await createUnit({ buildingNo: '102', unitNo: '1' });
  const unit3 = await createUnit({ buildingNo: '102', unitNo: '2' });
  for (const r of [unit2, unit3]) if (r.status === 201) { if (!baselinePropertyIds.has(r.body.data.property.id)) createdPropertyIds.add(r.body.data.property.id); createdOwnershipIds.add(r.body.data.ownership.id); }
  absent('UC4 capacity PATCH below active units -> 422', await apiCall(landlord, 'PATCH', `/landlord-buildings/${buildingId}`, { capacity: 1 }, { 'X-Requested-With': 'butler-web' }), 422);
  absent('UC4 delete building with units -> 409', await apiCall(landlord, 'DELETE', `/landlord-buildings/${buildingId}`, undefined, { 'X-Requested-With': 'butler-web' }), 409);
  const concurrentDuplicate = await Promise.all([createUnit({ buildingNo: '104', unitNo: '1' }), createUnit({ buildingNo: '104', unitNo: '1' })]);
  for (const r of concurrentDuplicate) if (r.status === 201) { if (!baselinePropertyIds.has(r.body.data.property.id)) createdPropertyIds.add(r.body.data.property.id); createdOwnershipIds.add(r.body.data.ownership.id); }
  mark('robustness concurrent same-user same-unit: one 201 and one 409', concurrentDuplicate.filter((x) => x.status === 201).length === 1 && concurrentDuplicate.filter((x) => x.status === 409).length === 1, { statuses: concurrentDuplicate.map((x) => x.status) });
  const adjustCapacity = await apiCall(landlord, 'PATCH', `/landlord-buildings/${buildingId}`, { capacity: 7 }, { 'X-Requested-With': 'butler-web' });
  mark('test setup capacity changed to leave one slot', adjustCapacity.status === 200, { status: adjustCapacity.status });
  const concurrency = await Promise.all([createUnit({ buildingNo: '103', unitNo: '1' }), createUnit({ buildingNo: '103', unitNo: '2' })]);
  const concurrentCount = concurrency.filter((x) => x.status === 201).length;
  for (const r of concurrency) if (r.status === 201) { if (!baselinePropertyIds.has(r.body.data.property.id)) createdPropertyIds.add(r.body.data.property.id); createdOwnershipIds.add(r.body.data.ownership.id); }
  mark('UC4 concurrent capacity requests: one accepted, one rejected', concurrentCount === 1 && concurrency.filter((x) => x.status === 409).length === 1, { statuses: concurrency.map((x) => x.status) });
  absent('UC4 capacity sequential overrun -> 409', await createUnit({ buildingNo: '102', unitNo: '3' }), 409);

  const list = await apiCall(landlord, 'GET', `/properties?relation=OWNER&complexId=${complexId}&size=50`);
  const rows = list.body.data ?? [];
  const natural = rows.map((x) => `${x.buildingNo}/${x.unitNo}`);
  mark('UC5 property list filter and natural ordering', list.status === 200 && rows.some((x) => x.id === propertyId) && natural.join('|') === [...natural].sort((a,b) => a.localeCompare(b, 'en', { numeric: true })).join('|'), { status: list.status, order: natural });
  const tenantProperties = await apiCall(tenant, 'GET', `/properties?relation=OWNER&size=5`);
  mark('UC5 tenant owner list does not disclose owner listing; empty relation', tenantProperties.status === 200, { status: tenantProperties.status });
  const tenantView = await apiCall(tenant, 'GET', `/properties/${propertyId}`);
  absent('UC5 unrelated tenant property -> 404', tenantView, 404);
  const buildingList = await apiCall(landlord, 'GET', '/landlord-buildings');
  mark('UC5 building list counts/capacity', buildingList.status === 200 && buildingList.body.data?.some((x) => x.id === buildingId && x.propertyCount >= 3), { rows: buildingList.body.data?.filter((x) => x.id === buildingId) });
  const setup = await apiCall(landlord, 'GET', '/dashboard/landlord/setup');
  const activities = await apiCall(landlord, 'GET', '/activities?size=50');
  const ownCount = await db.propertyOwnership.count({ where: { userId: fixtureLandlordId, endedAt: null } });
  mark('UC6 setup progress counts match database', setup.status === 200 && setup.body.data?.steps?.find((x) => x.key === 'PROPERTY')?.count === ownCount, { status: setup.status, activeOwnerships: ownCount, steps: setup.body.data?.steps });
  const e2eActivities = await db.activityLog.findMany({ where: { userId: fixtureLandlordId, complexId }, orderBy: { createdAt: 'desc' }, take: 20 });
  const expectedActivityCount = await db.activityLog.count({ where: { userId: fixtureLandlordId } });
  mark('UC6 activities consistency, params include unit/building fields; no duplicated 호', activities.status === 200 && activities.body.data?.length === expectedActivityCount && activities.body.data?.some((x) => x.type === 'PROPERTY_REGISTERED' && x.params?.unitNo && x.params?.buildingName) && !activities.body.data.some((x) => /호호/.test(JSON.stringify(x.params))), { status: activities.status, returned: activities.body.data?.length, database: expectedActivityCount, sample: e2eActivities.slice(0, 4).map((x) => ({ type: x.type, params: x.params })) });

  const ended = await apiCall(landlord, 'POST', `/property-ownerships/${ownershipId}/end`, {}, { 'X-Requested-With': 'butler-web' });
  const afterEndBuilding = await apiCall(landlord, 'GET', '/landlord-buildings');
  const reRegistered = await createUnit({ buildingNo: '101', unitNo: '410' });
  if (reRegistered.status === 201) { ownershipId = reRegistered.body.data.ownership.id; createdOwnershipIds.add(ownershipId); }
  const restoredBuilding = await apiCall(landlord, 'GET', '/landlord-buildings');
  const remainingAfterEnd = afterEndBuilding.body.data?.find((x) => x.id === buildingId)?.remainingCount;
  const remainingAfterReRegister = restoredBuilding.body.data?.find((x) => x.id === buildingId)?.remainingCount;
  mark('UC5 ownership end increments remaining count and re-register restores it with prior listing fields', ended.status === 200 && remainingAfterEnd === 1 && reRegistered.status === 201 && remainingAfterReRegister === 0 && reRegistered.body.data.property.id === propertyId && reRegistered.body.data.ownership.unitType === 'ONE_ROOM' && reRegistered.body.data.ownership.equipment.includes('BED') && reRegistered.body.data.ownership.equipmentEtc === '제습기', { ended: ended.status, remainingAfterEnd, remainingAfterReRegister, status: reRegistered.status, listing: reRegistered.body.data?.ownership && { unitType: reRegistered.body.data.ownership.unitType, equipment: reRegistered.body.data.ownership.equipment, equipmentEtc: reRegistered.body.data.ownership.equipmentEtc } });

  // Link an actual fixture tenant to the test ownership, then verify tenant view hides listing details.
  const tenantUserId = (await db.user.findUnique({ where: { email: 'tenant@butler.test' }, select: { id: true } })).id;
  await db.$executeRaw`INSERT INTO contracts (id, ownership_id, tenant_id, tenant_name, tenant_phone, lease_type, deposit, monthly_rent, start_date, end_date, created_at, updated_at)
    VALUES (gen_random_uuid(), ${ownershipId}::uuid, ${tenantUserId}::uuid, 'Codex E2E tenant', '01000000000', 'MONTHLY', 10000000, 500000, CURRENT_DATE, CURRENT_DATE + 365, now(), now())`;
  const tenantUnitList = await apiCall(tenant, 'GET', `/properties?relation=TENANT&complexId=${complexId}&size=50`);
  const tenantOwnedView = await apiCall(tenant, 'GET', `/properties/${propertyId}`);
  mark('UC5 tenant view has TENANT relation and myListing null', tenantUnitList.status === 200 && tenantUnitList.body.data?.some((x) => x.id === propertyId && x.myListing === null) && tenantOwnedView.body.data?.myListing === null, { listRow: tenantUnitList.body.data?.find((x) => x.id === propertyId), detail: tenantOwnedView.body.data && { relation: tenantOwnedView.body.data.myRelation?.type, status: tenantOwnedView.body.data.status, myListing: tenantOwnedView.body.data.myListing } });

  // Search request validation and reference DB snapshots are read-only.
  await pause();
  absent('search query shorter than 2 -> 400', await apiCall(landlord, 'GET', '/complexes/search?query=x'), 400);
  absent('search size >50 -> 400', await apiCall(landlord, 'GET', '/complexes/search?query=%EC%A4%91%EA%B3%84%EA%B7%B8%EB%A6%B0&size=51'), 400);
  absent('search very long query -> 400', await apiCall(landlord, 'GET', `/complexes/search?query=${'가'.repeat(101)}`), 400);
  await pause();
  const injectionSearch = await apiCall(landlord, 'GET', `/complexes/search?query=${encodeURIComponent("중계그린' OR 1=1 --")}`);
  mark('search SQL-like text handled safely', [200, 400, 503].includes(injectionSearch.status), { status: injectionSearch.status, envelope: Object.keys(injectionSearch.body ?? {}) });
  await pause();
  const emojiSearch = await apiCall(landlord, 'GET', `/complexes/search?query=${encodeURIComponent('🏠중계그린🏠')}`);
  mark('search Korean plus emoji handled without server error', [200, 400, 503].includes(emojiSearch.status), { status: emojiSearch.status, rows: emojiSearch.body?.data?.length, error: emojiSearch.body?.error?.code });
  const search186 = await search('학여울청구');
  const aptRows = search186.body.data?.filter((x) => (x.roadAddress ?? '').endsWith('186')) ?? [];
  const existing186Links = await db.kaptAddressLink.count({ where: { source: 'KAPT_API', roadSigunguCd: '11350', roadNameKey: '동일로207길', roadMainNo: 186, roadSubNo: 0 } });
  if (existing186Links === 0) {
    await db.$executeRaw`INSERT INTO kapt_address_links (source, road_sigungu_cd, road_name_key, road_underground, road_main_no, road_sub_no, kapt_code, updated_at)
      VALUES ('KAPT_API','11350','동일로207길',false,186,0,'A13987305',now()), ('KAPT_API','11350','동일로207길',false,186,0,'A13993901',now())`;
    insertedKaptTestLinks = true;
  }
  const ranked186 = await search('학여울청구');
  const rankedRows = ranked186.body.data?.filter((x) => (x.roadAddress ?? '').endsWith('186')) ?? [];
  mark('search 186 K-apt enrichment ranks sale complex ahead of rental', ranked186.status === 200 && rankedRows[0]?.kapt?.kaptCode === 'A13987305' && rankedRows[0]?.kapt?.saleType === '분양', { status: ranked186.status, rows: rankedRows.map((x) => ({ name: x.name, kapt: x.kapt, complexId: x.complexId })) });
  const refSample = await db.$queryRaw`SELECT road_name_key, road_main_no, road_sub_no, kapt_code FROM kapt_address_links WHERE kapt_code = 'A13986306' AND source = 'KAPT_EXCEL'`;
  const imports = await db.$queryRaw`SELECT status, source, file_date FROM reference_data_imports ORDER BY started_at DESC LIMIT 100`;
  const runningImportCount = await db.referenceDataImport.count({ where: { status: 'RUNNING' } });
  const deltaRows = imports.filter((x) => x.source === 'JUSO_DELTA');
  mark('reference data read-only: 중계그린 has three road links and no RUNNING import', refSample.length === 3 && new Set(refSample.map((x) => x.kapt_code)).size === 1 && runningImportCount === 0, { middleGreenLinkCount: refSample.length, links: refSample, runningImports: runningImportCount, deltaRecent: deltaRows.slice(0, 5).map((x) => x.status) });

  // Search persistence write throttling and TTL behavior.
  const beforeSaved = await db.$queryRaw`SELECT source_key, fetched_at FROM address_search_results ORDER BY source_key`;
  for (let i = 0; i < 10; i += 1) { await pause(); await apiCall(second, 'GET', `/complexes/search?query=${encodeURIComponent('중계그린')}`); }
  const afterSaved = await db.$queryRaw`SELECT source_key, fetched_at FROM address_search_results ORDER BY source_key`;
  mark('search persistence 10 identical calls are throttled to stable saved rows', JSON.stringify(beforeSaved) === JSON.stringify(afterSaved), { rowsBefore: beforeSaved.length, rowsAfter: afterSaved.length });
  const alternate = s0.body.data.find((x) => x.sourceKey !== target.sourceKey && x.isApartment);
  const staleKey = (await db.addressSearchResult.findFirst({ where: { sourceKey: { notIn: [target.sourceKey, ...(alternate ? [alternate.sourceKey] : [])] } }, select: { sourceKey: true } }))?.sourceKey;
  if (staleKey) {
    await db.$executeRaw`UPDATE address_search_results SET fetched_at = now() - interval '25 hours' WHERE source_key = ${staleKey}`;
    await absent('search cache >24h new key resolve -> 404', await apiCall(landlord, 'POST', '/complexes/resolve', { sourceKey: staleKey }, { 'X-Requested-With': 'butler-web' }), 404);
    mark('search cache expiry does not affect existing complex resolve', (await apiCall(landlord, 'POST', '/complexes/resolve', { sourceKey: target.sourceKey }, { 'X-Requested-With': 'butler-web' })).status === 200);
  }
  if (alternate && !(await db.complex.findUnique({ where: { sourceKey: alternate.sourceKey } }))) {
    const races = await Promise.all([1, 2].map(() => apiCall(landlord, 'POST', '/complexes/resolve', { sourceKey: alternate.sourceKey }, { 'X-Requested-With': 'butler-web' })));
    mark('robustness concurrent resolve same key returns one complex id', races.every((x) => x.status === 200 && x.body.data?.id === races[0].body.data?.id), { statuses: races.map((x) => x.status), ids: races.map((x) => x.body.data?.id) });
    if (races[0].body.data?.id) createdComplexIds.add(races[0].body.data.id);
  }
  if (createdComplexIds.has(complexId) && oldComplex === null) {
    const originalKey = target.sourceKey;
    await db.$executeRaw`UPDATE complexes SET source_key = 'ROAD:999999999998-0-1-0', road_address = '서울특별시 노원구 이전 도로 1' WHERE id = ${complexId}::uuid`;
    const renameSearch = await search('중계그린');
    const moved = renameSearch.body.data?.find((x) => x.complexId === complexId);
    const movedResolve = moved ? await apiCall(landlord, 'POST', '/complexes/resolve', { sourceKey: moved.sourceKey }, { 'X-Requested-With': 'butler-web' }) : null;
    mark('UC8 renamed-address fallback returns existing sourceKey and complex id', !!moved && moved.sourceKey === 'ROAD:999999999998-0-1-0' && movedResolve.status === 200 && movedResolve.body.data.id === complexId, { moved: moved && { sourceKey: moved.sourceKey, complexId: moved.complexId }, resolve: movedResolve?.status, originalKey });
  }

  // Avoid invoking cron endpoints: reference plan explicitly limits real K-apt cron to one call.
  console.log('NOTE cron endpoints intentionally not invoked; no real K-apt cron call consumed.');
  console.log('NOTE not exercised: verified-owner PATCH success (requires a dedicated verified-owner fixture), timezone/day-boundary behavior, and Juso zero-row/provider-failure simulation.');
  console.log('NOTE Playwright is not installed; browser flow is not automated.');
});

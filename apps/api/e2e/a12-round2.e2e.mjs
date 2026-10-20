import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
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
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const db = new PrismaClient();
const base = 'http://127.0.0.1:4000/api/v1';
const tag = `codex-r2-${Date.now()}-${randomUUID().slice(0, 7)}`;
const userId = randomUUID();
const keys = new Set();
const complexIds = new Set();
const propertyIds = new Set();
const ownershipIds = new Set();
const children = [];
const countersBefore = new Set();
let landlordId;
let fixtureCookie;
let cookie;
let available = false;
let cronCalled = false;
let baseline = {};
const log = (scenario, ok, details = {}) => console.log(`${ok ? 'PASS' : 'FAIL'} ${scenario} ${JSON.stringify(details)}`);
const call = async (origin, auth, method, route, body, headers = {}) => {
  let response;
  for(let attempt=0;attempt<3;attempt++) { try { response=await fetch(`${origin}${route}`, { method, headers: { ...(auth ? { Cookie: auth } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) }); break; } catch(e) { if(attempt===2) throw new Error(`fetch ${method} ${route} failed: ${e.cause?.code??e.message}`); await new Promise(r=>setTimeout(r,300)); } }
  const raw = await response.text(); let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw: raw.slice(0, 200) }; }
  return { status: response.status, data, headers: response.headers };
};
const postHeaders = { 'X-Requested-With': 'butler-web' };
const login = async (email) => {
  const r = await call(base, null, 'POST', '/auth/login', { email, password: 'password123' }, postHeaders);
  const token = r.headers.getSetCookie().find((v) => v.startsWith('access_token='));
  assert.ok(token, `login ${email}: ${r.status}`); return token.split(';')[0];
};
const timed = async (fn) => { const start = performance.now(); const value = await fn(); return { value, ms: performance.now() - start }; };
const percentile = (xs, p) => [...xs].sort((a,b)=>a-b)[Math.min(xs.length-1, Math.ceil(xs.length*p)-1)];
const statusDistribution = (results) => results.reduce((a,x)=>(a[x.status]=(a[x.status]??0)+1,a),{});
const waitPort = async (url, child) => {
  const until = Date.now()+20000;
  while(Date.now()<until) { if(child.exitCode!==null) throw new Error(`child exited ${child.exitCode}`); try { const r=await fetch(url,{signal:AbortSignal.timeout(500)}); if(r.status) return; } catch {} await new Promise(r=>setTimeout(r,150)); }
  throw new Error(`server did not start: ${url}`);
};
const startServer = async (port, overrides) => {
  const child=spawn(process.execPath,['src/server.js'],{cwd:apiDir,env:{...process.env,PORT:String(port),...overrides},stdio:['ignore','pipe','pipe']});
  let output=''; child.stdout.on('data',b=>output+=b.toString()); child.stderr.on('data',b=>output+=b.toString()); children.push(child);
  try { await waitPort(`http://127.0.0.1:${port}/api/v1/auth/me`,child); } catch(e) { throw new Error(`${e.message}; ${output.slice(-1000)}`); }
  return `http://127.0.0.1:${port}/api/v1`;
};
const baselineCounts = async () => ({ users: await db.user.count(), complexes: await db.complex.count(), landlord_buildings: await db.landlordBuilding.count(), properties: await db.property.count(), property_ownerships: await db.propertyOwnership.count(), activity_logs: await db.activityLog.count(), address_search_results: await db.addressSearchResult.count() });

before(async () => {
  for(let i=0;i<8&&!available;i++){ try { const r=await fetch(`${base}/auth/me`,{signal:AbortSignal.timeout(2000)}); available=r.status>0; } catch { await new Promise(r=>setTimeout(r,500)); } }
  if(!available) return;
  baseline=await baselineCounts();
  for(const x of await db.rateLimitCounter.findMany({select:{key:true}})) countersBefore.add(x.key);
  await db.rateLimitCounter.deleteMany({where:{OR:[{key:{startsWith:'login:landlord@butler.test:'}},{key:{startsWith:'login:tenant@butler.test:'}},{key:{startsWith:'login:admin@butler.test:'}}]}});
  const users=await db.user.findMany({where:{email:{in:['landlord@butler.test','tenant@butler.test','admin@butler.test']}},select:{id:true,email:true}});
  landlordId=users.find(x=>x.email==='landlord@butler.test').id;
  fixtureCookie=await login('landlord@butler.test');
  await db.$executeRaw`INSERT INTO users (id,email,password_hash,name,role,status,created_at,updated_at) VALUES (${userId}::uuid,${`${tag}@butler.test`},'unused','Round2 landlord','LANDLORD','ACTIVE',now(),now())`;
  cookie=`access_token=${jwt.sign({userId:userId,role:'LANDLORD'},process.env.ACCESS_TOKEN_SECRET,{expiresIn:'1h'})}`;
});

after(async () => {
  for(const child of children) { if(child.exitCode===null) child.kill(); }
  await Promise.all(children.map(child=>new Promise(resolve=>{ if(child.exitCode!==null)return resolve(); const t=setTimeout(resolve,3000); child.once('exit',()=>{clearTimeout(t);resolve();}); })));
  if(available) {
    try {
      await db.activityLog.deleteMany({where:{userId}});
      const allOwned=await db.propertyOwnership.findMany({where:{userId},select:{id:true,propertyId:true}});
      allOwned.forEach(x=>{ownershipIds.add(x.id);propertyIds.add(x.propertyId)});
      const ownedIds=[...ownershipIds];
      if(ownedIds.length) await db.$executeRaw`DELETE FROM contracts WHERE ownership_id = ANY(${ownedIds}::uuid[])`;
      if(ownershipIds.size) await db.propertyOwnership.deleteMany({where:{userId}});
      if(propertyIds.size) { await db.activityLog.deleteMany({where:{propertyId:{in:[...propertyIds]}}}); await db.propertyOwnership.deleteMany({where:{propertyId:{in:[...propertyIds]}}}); await db.property.deleteMany({where:{id:{in:[...propertyIds]}}}); }
      if(complexIds.size) await db.activityLog.deleteMany({where:{complexId:{in:[...complexIds]}}});
      await db.landlordBuilding.deleteMany({where:{userId}});
      if(complexIds.size) {
        const ids=[...complexIds];
        await db.landlordBuilding.deleteMany({where:{complexId:{in:ids}}});
        const props=await db.property.findMany({where:{complexId:{in:ids}},select:{id:true}});
        const pids=props.map(x=>x.id);
        if(pids.length) {
          await db.activityLog.deleteMany({where:{propertyId:{in:pids}}});
          await db.propertyOwnership.deleteMany({where:{propertyId:{in:pids}}});
          await db.property.deleteMany({where:{id:{in:pids}}});
        }
        await db.complex.deleteMany({where:{id:{in:ids}}});
      }
      if(keys.size) await db.addressSearchResult.deleteMany({where:{sourceKey:{in:[...keys]}}});
      await db.user.deleteMany({where:{id:userId}});
      const fixtureUsers=await db.user.findMany({where:{email:{in:['landlord@butler.test','tenant@butler.test','admin@butler.test']}},select:{id:true,email:true}});
      const testUserKeys=[`complex-search:${userId}`,`general:${userId}`,...fixtureUsers.flatMap(u=>[`complex-search:${u.id}`,`general:${u.id}`])];
      await db.$executeRaw`DELETE FROM rate_limit_counters WHERE key = ANY(${testUserKeys}::text[])`;
      const remaining=await baselineCounts();
      console.log('CLEANUP_BASELINE',JSON.stringify(baseline),'CLEANUP_REMAINING',JSON.stringify(remaining),'MATCH',JSON.stringify(baseline)===JSON.stringify(remaining));
      console.log('CHILD_SERVERS',JSON.stringify(children.map(c=>({pid:c.pid,exitCode:c.exitCode,killed:c.exitCode!==null}))));
    } catch(e) { console.error('CLEANUP_ERROR',e.message); }
  }
  await db.$disconnect();
});

test('A-12 round 2 production risks', async (t) => {
  if(!available) { t.skip('local API unavailable'); return; }
  const failures=[];
  const run=async(name,fn)=>{ try { const result=await fn(); log(name,true,result??{}); } catch(e) { failures.push({name,error:e.message}); log(name,false,{error:e.message}); } };
  await run('ownership VERIFIED permits PATCH and expired VERIFIED is forbidden',async()=>{
    const key=`ROAD:991234567890-0-1-${Math.floor(Math.random()*9000)+1000}`; keys.add(key);
    const created=await db.addressSearchResult.create({data:{sourceKey:key,payload:{roadAddr:'Round2 Verified test street 1',rnMgtSn:'991234567890',buldMnnm:'1',buldSlno:'0',admCd:'1135010400',zipNo:'00000',bdMgtSn:'R2-VERIFIED'}}});
    const resolved=await call(base,fixtureCookie,'POST','/complexes/resolve',{sourceKey:key},postHeaders); assert.equal(resolved.status,200);
    const id=resolved.data.data.id;complexIds.add(id);
    const prop=await call(base,cookie,'POST','/properties',{complexId:id,buildingNo:'1동',unitNo:'101호'},{...postHeaders}); assert.equal(prop.status,201);
    const own=prop.data.data.ownership.id; ownershipIds.add(own); propertyIds.add(prop.data.data.property.id);
    await db.$executeRaw`UPDATE property_ownerships SET verification_status='VERIFIED', verified_at=now(), verification_expires_at=now()+interval '1 day' WHERE id=${own}::uuid`;
    const rows=await db.propertyOwnership.findMany({where:{propertyId:prop.data.data.property.id,userId},select:{id:true,userId:true,endedAt:true,verificationStatus:true,verificationExpiresAt:true}}); const ok=await call(base,cookie,'PATCH','/properties/'+prop.data.data.property.id,{floor:3},postHeaders); if(ok.status!==200) throw new Error(JSON.stringify({status:ok.status,error:ok.data?.error,who:jwt.decode(cookie.slice(12)),propertyId:prop.data.data.property.id,own,rows}));
    await db.$executeRaw`UPDATE property_ownerships SET verification_status='VERIFIED', verified_at=now()-interval '31 days', verification_expires_at=now()-interval '1 millisecond' WHERE id=${own}::uuid`;
    const expired=await call(base,cookie,'PATCH',`/properties/${prop.data.data.property.id}`,{floor:4},postHeaders); assert.equal(expired.status,403);
    return {verified:ok.status,expired:expired.status,expiredError:expired.data.error?.code};
  });
  await run('juso empty result and zero-row search',async()=>{
    const r=await call(base,cookie,'GET','/complexes/search?query=ㅉㅉㅉㅉㅉ');
    assert.equal(r.status,200); assert.deepEqual(r.data.data,[]); return {status:r.status,rows:r.data.data.length};
  });
  await run('resolve fetched 23h59 succeeds and 24h01 expires',async()=>{
    const fresh=`ROAD:991234567891-0-1-${Math.floor(Math.random()*9000)+1000}`, stale=`ROAD:991234567892-0-1-${Math.floor(Math.random()*9000)+1000}`; keys.add(fresh);keys.add(stale);
    const now=new Date(); await db.addressSearchResult.createMany({data:[{sourceKey:fresh,payload:{roadAddr:'Boundary fresh 1',rnMgtSn:'991234567891',buldMnnm:'1',admCd:'1135010400'},fetchedAt:new Date(now.getTime()-23*3600000-59*60000)},{sourceKey:stale,payload:{roadAddr:'Boundary stale 1',rnMgtSn:'991234567892',buldMnnm:'1',admCd:'1135010400'},fetchedAt:new Date(now.getTime()-24*3600000-60000)}]});
    const a=await call(base,cookie,'POST','/complexes/resolve',{sourceKey:fresh},postHeaders);const b=await call(base,cookie,'POST','/complexes/resolve',{sourceKey:stale},postHeaders);
    assert.equal(a.status,200);assert.equal(b.status,404);complexIds.add(a.data.data.id);return {fresh:a.status,stale:b.status};
  });
  await run('20 concurrent resolves create one complex',async()=>{
    const key=`ROAD:991234567893-0-1-${Math.floor(Math.random()*9000)+1000}`;keys.add(key);
    await db.addressSearchResult.create({data:{sourceKey:key,payload:{roadAddr:'Concurrency resolve 1',rnMgtSn:'991234567893',buldMnnm:'1',admCd:'1135010400'}}});
    const ts=performance.now();const rs=await Promise.all(Array.from({length:20},()=>call(base,cookie,'POST','/complexes/resolve',{sourceKey:key},postHeaders)));const ms=performance.now()-ts;
    assert.ok(rs.every(r=>r.status===200));const ids=new Set(rs.map(r=>r.data.data.id));assert.equal(ids.size,1);complexIds.add([...ids][0]);
    return {statuses:statusDistribution(rs),uniqueComplexes:ids.size,elapsedMs:+ms.toFixed(1)};
  });
  await run('50 parallel property registrations respect capacity 40',async()=>{
    const key=`ROAD:991234567894-0-1-${Math.floor(Math.random()*9000)+1000}`;keys.add(key);
    await db.addressSearchResult.create({data:{sourceKey:key,payload:{roadAddr:'Capacity test 1',rnMgtSn:'991234567894',buldMnnm:'1',admCd:'1135010400'}}});
    const r=await call(base,cookie,'POST','/complexes/resolve',{sourceKey:key},postHeaders);assert.equal(r.status,200);const id=r.data.data.id;complexIds.add(id);
    const building=await call(base,cookie,'POST','/landlord-buildings',{complexId:id,name:`${tag} capacity`,capacity:40},postHeaders);assert.equal(building.status,201);
    const start=performance.now();const rs=await Promise.all(Array.from({length:50},(_,i)=>call(base,cookie,'POST','/properties',{complexId:id,buildingNo:'1',unitNo:`${i+1}호`},postHeaders)));const ms=performance.now()-start;
    const counts=statusDistribution(rs);const expected=rs.filter(x=>x.data?.error?.code==='LANDLORD_BUILDING_CAPACITY_EXCEEDED').length;
    const rows=await db.propertyOwnership.findMany({where:{userId,property:{complexId:id}},select:{id:true,propertyId:true}});rows.forEach(x=>{ownershipIds.add(x.id);propertyIds.add(x.propertyId)});
    assert.equal(counts[201],40);assert.equal(expected,10);assert.equal(rows.length,40);
    return {statuses:counts,capacityErrors:expected,dbCount:rows.length,elapsedMs:+ms.toFixed(1)};
  });
  await run('30 parallel same-keyword searches from three users with limiter metrics',async()=>{
    await db.rateLimitCounter.deleteMany({where:{key:{in:[`complex-search:${userId}`,`complex-search:${landlordId}`,`complex-search:00000000-0000-4000-8000-000000000002`]}}});
    const users=[cookie,fixtureCookie,await login('tenant@butler.test')];
    const start=performance.now();const samples=await Promise.all(Array.from({length:30},(_,i)=>timed(()=>call(base,users[i%3],'GET','/complexes/search?query=중계그린'))));const wall=performance.now()-start;const lat=samples.map(x=>x.ms);const results=samples.map(x=>x.value);const dist=statusDistribution(results);
    assert.equal(results.length,30);assert.equal(Object.values(dist).reduce((a,b)=>a+b,0),30);
    return {statuses:dist,perUser:10,expected429:0,p50Ms:+percentile(lat,.5).toFixed(1),p95Ms:+percentile(lat,.95).toFixed(1),wallMs:+wall.toFixed(1),limiter:'20/user/min; no 429 expected at 10 each'};
  });
  await run('juso invalid-key and 1ms-timeout isolated API instances',async()=>{
    const badKey=await startServer(4001,{JUSO_API_KEY:'invalid-round2-key'});
    const search=await call(badKey,cookie,'GET','/complexes/search?query=중계그린');
    assert.equal(search.status,503);assert.ok(search.data.error?.code);
    const complex=await db.complex.findFirst({where:{id:{in:[...complexIds]}}});assert.ok(complex);
    const resolved=await call(badKey,cookie,'POST','/complexes/resolve',{sourceKey:complex.sourceKey},postHeaders);assert.equal(resolved.status,200);
    const reg=await call(badKey,cookie,'POST','/properties',{complexId:complex.id,buildingNo:'9',unitNo:'901'},postHeaders);assert.equal(reg.status,201);ownershipIds.add(reg.data.data.ownership.id);propertyIds.add(reg.data.data.property.id);
    const timeoutApi=await startServer(4002,{JUSO_TIMEOUT_MS:'1'});
    const timeout=await call(timeoutApi,cookie,'GET','/complexes/search?query=중계그린');assert.equal(timeout.status,503);
    const envelope=(x)=>x.data?.error && typeof x.data.error.code==='string';assert.ok(envelope(search)&&envelope(timeout));
    return {invalidKey:search.status,error:search.data.error.code,envelope:envelope(search),resolveExisting:resolved.status,registration:reg.status,timeout:timeout.status,timeoutError:timeout.data.error.code,timeoutEnvelope:envelope(timeout)};
  });
  await run('landlord building input fuzz and pagination validation',async()=>{
    const key=`ROAD:991234567895-0-1-${Math.floor(Math.random()*9000)+1000}`;keys.add(key);await db.addressSearchResult.create({data:{sourceKey:key,payload:{roadAddr:'Fuzz test 1',rnMgtSn:'991234567895',buldMnnm:'1',admCd:'1135010400'}}});
    const resolved=await call(base,cookie,'POST','/complexes/resolve',{sourceKey:key},postHeaders);assert.equal(resolved.status,200);complexIds.add(resolved.data.data.id);
    const outcomes=[];
    for(const [field,value] of [['name',null],['name',12],['name',''],['name','x'.repeat(51)],['capacity',0],['capacity',-1],['capacity',1000],['capacity','9'],['memo',12],['memo','x'.repeat(501)]]) { const body={complexId:resolved.data.data.id,name:`${tag} fuzz`};body[field]=value;const x=await call(base,cookie,'POST','/landlord-buildings',body,postHeaders);outcomes.push({field,valueType:typeof value,status:x.status});assert.equal(x.status,400); }
    const made=await call(base,cookie,'POST','/landlord-buildings',{complexId:resolved.data.data.id,name:`${tag} fuzz`},postHeaders);assert.equal(made.status,201);
    const patchCases=[{name:null},{name:1000},{name:'<script>alert(1)</script>'},{capacity:null},{capacity:0},{capacity:1000},{capacity:-3},{memo:null},{memo:['x']},{memo:'<script>alert(1)</script>'},{memo:'x'.repeat(501)}];
    for(const body of patchCases){const x=await call(base,cookie,'PATCH',`/landlord-buildings/${made.data.data.id}`,body,postHeaders);outcomes.push({patch:Object.keys(body)[0],status:x.status,code:x.data?.error?.code}); if(body.name==='<script>alert(1)</script>'||body.memo==='<script>alert(1)</script>'||body.capacity===null||body.memo===null) assert.equal(x.status,200);else assert.equal(x.status,400);}
    const pages=[];for(const page of ['0','-1','100000000','abc']){const x=await call(base,cookie,'GET',`/landlord-buildings?page=${page}`);pages.push({page,status:x.status});assert.equal(x.status,400);}
    return {postCases:outcomes.slice(0,10),patchCases:outcomes.slice(10),pages};
  });
  await run('landlord web routes and assets return HTTP 200',async()=>{
    const origin='http://localhost:5173';const routes=['/','/favicon.ico','/vite.svg','/src/main.jsx','/src/App.jsx'];const results=[];
    for(const route of routes){const r=await fetch(origin+route,{signal:AbortSignal.timeout(5000)});results.push({route,status:r.status,contentType:r.headers.get('content-type')});}
    assert.ok(results[0].status===200);const assets=results.filter(x=>x.route!=='/favicon.ico'&&x.route!=='/vite.svg');assert.ok(assets.every(x=>x.status===200));return {results,note:'SPA is history-state driven; route views are not standalone URLs. No Playwright.'};
  });
  await run('reference-data cron authenticated once; wrong and missing secret rejected',async()=>{
    if(!process.env.CRON_SECRET) throw new Error('CRON_SECRET absent in loaded env');
    const t=performance.now();const good=await fetch('http://127.0.0.1:4000/api/cron/reference-data',{headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`},signal:AbortSignal.timeout(60000)});const elapsed=performance.now()-t;const body=await good.json();cronCalled=true;
    const wrong=await fetch('http://127.0.0.1:4000/api/cron/reference-data',{headers:{Authorization:'Bearer definitely-wrong'},signal:AbortSignal.timeout(5000)});const missing=await fetch('http://127.0.0.1:4000/api/cron/reference-data',{signal:AbortSignal.timeout(5000)});
    const job=await db.job.findFirst({where:{type:'REFERENCE_DATA_DAILY'},orderBy:{createdAt:'desc'}});
    assert.equal(good.status,200);assert.ok([401,403].includes(wrong.status));assert.ok([401,403].includes(missing.status));
    assert.ok(job);const running=await db.job.count({where:{type:'REFERENCE_DATA_DAILY',status:'PROCESSING'}});
    assert.equal(running,0);assert.ok(Number(body.data?.elapsedAtStart??body.elapsedAtStart??999999)<10000);
    return {status:good.status,elapsedMs:+elapsed.toFixed(1),elapsedAtStart:body.data?.elapsedAtStart??body.elapsedAtStart,job:{id:job.id,status:job.status,payload:job.payload},running,wrongSecret:wrong.status,missingSecret:missing.status};
  });
  if(failures.length) assert.fail(`${failures.length} scenario(s) failed: ${JSON.stringify(failures)}`);
});





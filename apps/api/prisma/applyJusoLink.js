// 공식 연계 하루치를 받아 적용하거나(기본) 계획만 본다(--dry-run). cron과 같은 코드. 확인·수동 따라잡기용.
// 실행: npm run apply:juso-link -w apps/api -- --date YYYY-MM-DD [--dry-run] [--allow-gap]
// --date: 연계 기준일(= 건물DB 일변동분 stdde + 1). 승인키는 .env의 JUSO_LINK_API_KEY(출력하지 않는다).
// 적용은 공식 연계 기준점(juso-link:cutover)이 있어야 하고, 커서 다음 날짜만 한다(--allow-gap은 손으로 확인했을 때만).
import '../src/loadEnv.js';
import { refillComplexKaptCodes } from '../src/referenceData/complexKaptCodes.js';
import { applyJusoLinkDay, planJusoLinkDay, readJusoLinkDay } from '../src/referenceData/jusoLinkApply.js';
import { getJusoLinkApiKey } from '../src/referenceData/jusoLinkMode.js';
import { downloadJusoLink, evaluateLinkDay, groupLinkFilesByDate, LINK_CODES } from '../src/referenceData/jusoLinkResponse.js';
import { createKeySet } from '../src/referenceData/jusoLinks.js';
import { prisma } from '../src/platform/prismaClient.js';
import { readOption, toUsageError } from './referenceDataArgs.js';

const main = async () => {
  const argv = process.argv.slice(2);
  const linkDate = readOption(argv, '--date');
  if (!linkDate || !/^\d{4}-\d{2}-\d{2}$/.test(linkDate)) throw toUsageError('--date YYYY-MM-DD가 필요합니다.');
  const appKey = getJusoLinkApiKey();
  if (!appKey) throw toUsageError('.env에 JUSO_LINK_API_KEY가 없습니다.');

  const startedAt = Date.now();
  const filesByCode = {};
  for (const cntcCode of Object.values(LINK_CODES)) {
    filesByCode[cntcCode] = await downloadJusoLink({ appKey, cntcCode, from: linkDate, to: linkDate });
  }
  const day = groupLinkFilesByDate(filesByCode).get(linkDate);
  const state = evaluateLinkDay(day);
  if (state.status !== 'complete') throw toUsageError(`${linkDate} 자료가 아직 다 없습니다: ${JSON.stringify(state)}`);
  const read = await readJusoLinkDay(day);

  if (argv.includes('--dry-run')) {
    const plan = await planJusoLinkDay({ prisma, tables: read.tables });
    console.info('[apply:juso-link] 계획(쓰기 없음)', JSON.stringify({ linkDate, gate: plan.gate, ...plan.planned }, null, 2));
    return;
  }

  const keySet = createKeySet();
  const result = await applyJusoLinkDay({ prisma, linkDate, ...read, allowGap: argv.includes('--allow-gap'), keySet });
  const refilled = ['SUCCEEDED', 'PARTIAL'].includes(result.status) ? await refillComplexKaptCodes(prisma, keySet.values()) : 0;
  console.info(
    '[apply:juso-link] 끝',
    JSON.stringify({ ...result, changedKeys: keySet.size, complexKaptCodesChanged: refilled, ms: Date.now() - startedAt }, null, 2),
  );
  if (result.status === 'FAILED' || result.status === 'PARTIAL') process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error('[apply:juso-link] 실패:', error.reason ?? error.code ?? 'internal error');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

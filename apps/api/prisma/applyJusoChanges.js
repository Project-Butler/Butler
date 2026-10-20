// juso 건물DB 일변동분 파일 하나를 juso_building_links에 적용한다(매일 cron과 같은 코드). cron을 켜기 전·받기가 안 될 때·A팀 확인용.
// 실행: npm run apply:juso-changes -w apps/api -- <YYYYMMDD_dailynoticedata.zip 또는 TI_SPBD_BULD.TXT> [--date YYYY-MM-DD] [--allow-gap]
// --date: 변동 기준일(stdde, 기본: 파일 이름의 YYYYMMDD). 커서(마지막 성공 날짜) 다음 날이 아니면 적용하지 않는다 —
// --allow-gap은 빠진 날짜를 알고 일부러 건너뛸 때만(그 사이 변동은 다음 전체 재적재 때 채워짐).
// 같은 날짜가 이미 성공이면 건너뛴다. 끝에 바뀐 도로명 키의 단지 kaptCode를 다시 채운다.
import '../src/loadEnv.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { applyJusoDeltaFile } from '../src/domains/referenceData/jusoDelta.js';
import { refillComplexKaptCodes } from '../src/domains/referenceData/complexKaptCodes.js';
import { createKeySet } from '../src/domains/referenceData/jusoLinks.js';
import { prisma } from '../src/platform/prismaClient.js';
import { readOption, readPathArg, toUsageError } from './referenceDataArgs.js';

const dateFromName = (filePath) => {
  const match = /(\d{4})(\d{2})(\d{2})_dailynoticedata/.exec(path.basename(filePath));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const main = async () => {
  const argv = process.argv.slice(2);
  const filePath = readPathArg(argv, ['--date']);
  if (!filePath) throw toUsageError('변동분 파일 경로가 필요합니다: npm run apply:juso-changes -- <파일>');
  const fileDate = readOption(argv, '--date') ?? dateFromName(filePath);
  if (!fileDate) throw toUsageError('파일 이름에 날짜가 없습니다. --date YYYY-MM-DD를 주세요.');

  const startedAt = Date.now();
  const keySet = createKeySet();
  const result = await applyJusoDeltaFile({
    prisma,
    fileDate,
    fileName: path.basename(filePath),
    buffer: await readFile(filePath),
    allowGap: argv.includes('--allow-gap'),
    keySet,
  });
  const refilled = result.status === 'SUCCEEDED' || result.status === 'PARTIAL' ? await refillComplexKaptCodes(prisma, keySet.values()) : 0;
  console.info(
    '[apply:juso-changes] 끝',
    JSON.stringify({ ...result, changedKeys: keySet.size, complexKaptCodesChanged: refilled, ms: Date.now() - startedAt }, null, 2),
  );
  if (result.status === 'FAILED' || result.status === 'PARTIAL') process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error('[apply:juso-changes] 실패:', error.reason ?? error.code ?? 'internal error');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

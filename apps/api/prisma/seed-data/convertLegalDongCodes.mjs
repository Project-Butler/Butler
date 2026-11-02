// 공공데이터포털 "국토교통부_전국 법정동" 원본 CSV를 legal-dong-codes.csv 형식으로 바꾼다.
// 사용: node prisma/seed-data/convertLegalDongCodes.mjs "<원본 CSV 경로>"
// 원본 파일은 커밋하지 않는다. 절차는 같은 폴더의 README.md.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, 'legal-dong-codes.csv');
const SOURCE_COLUMNS = ['법정동코드', '시도명', '시군구명', '읍면동명', '리명'];

// 원본은 일반구를 "수원시장안구"처럼 붙여 쓴다. 도로명주소 API·화면 표기에 맞춰 "수원시 장안구"로 띄운다.
const splitGeneralGu = (sigunguName) => sigunguName.replace(/^(.+?시)(.+구)$/, '$1 $2');

const parseSource = (text) => {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const header = lines[0].split(',').map((col) => col.trim());
  const missing = SOURCE_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length > 0) throw new Error(`원본 헤더에 ${missing.join(', ')} 컬럼이 없습니다.`);

  const index = Object.fromEntries(SOURCE_COLUMNS.map((col) => [col, header.indexOf(col)]));
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    return {
      code: cells[index['법정동코드']],
      sido: cells[index['시도명']],
      sigungu: cells[index['시군구명']],
      dong: cells[index['읍면동명']],
      ri: cells[index['리명']],
    };
  });
};

// 동(洞·읍·면) 단위만 남긴다. 시도·시군구 자체 행(읍면동명 없음)과 리 행은 뺀다 —
// 커뮤니티·단지가 동 단위 코드(끝 두 자리 00)를 쓰기 때문이다.
const toRegions = (sourceRows) =>
  sourceRows
    .filter((row) => row.dong && !row.ri)
    .map((row) => {
      const sigunguName = splitGeneralGu(row.sigungu);
      return {
        legalDongCode: row.code,
        sidoName: row.sido,
        sigunguName,
        dongName: row.dong,
        fullName: [row.sido, sigunguName, row.dong].filter(Boolean).join(' '),
      };
    });

const assertRegions = (regions, sourceRows) => {
  const byCode = new Map(regions.map((region) => [region.legalDongCode, region]));
  const failures = [];

  if (regions.length < 4000) failures.push(`동 단위가 ${regions.length}건뿐입니다.`);
  if (byCode.size !== regions.length) failures.push('같은 법정동 코드가 두 번 이상 나옵니다.');
  if (regions.some((region) => !/^\d{8}00$/.test(region.legalDongCode))) {
    failures.push('끝이 00이 아닌 코드가 섞였습니다.');
  }
  if (regions.some((region) => region.fullName.includes(','))) failures.push('이름에 쉼표가 있습니다.');
  if (byCode.get('4111112900')?.sigunguName !== '수원시 장안구') {
    failures.push('일반구(수원시 장안구 파장동)가 바르게 나뉘지 않았습니다.');
  }
  if (!byCode.has('3611010100')) failures.push('세종 반곡동(3611010100)이 없습니다.');
  const riRow = sourceRows.find((row) => row.ri);
  if (riRow && byCode.has(riRow.code)) failures.push(`리 단위 코드 ${riRow.code}가 남았습니다.`);

  if (failures.length > 0) throw new Error(`변환 결과 확인 실패:\n- ${failures.join('\n- ')}`);
};

const main = () => {
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error('원본 CSV 경로를 인자로 주세요.');

  const sourceRows = parseSource(readFileSync(sourcePath, 'utf-8'));
  const regions = toRegions(sourceRows);
  assertRegions(regions, sourceRows);

  const header = 'legalDongCode,sidoName,sigunguName,dongName,fullName';
  const body = regions.map((region) =>
    [region.legalDongCode, region.sidoName, region.sigunguName, region.dongName, region.fullName].join(','),
  );
  writeFileSync(OUTPUT_PATH, `${[header, ...body].join('\n')}\n`, 'utf-8');
  console.info(`[convert] 동 단위 ${regions.length}건을 legal-dong-codes.csv에 썼습니다.`);
};

try {
  main();
} catch (error) {
  console.error('[convert] 실패:', error.message);
  process.exitCode = 1;
}

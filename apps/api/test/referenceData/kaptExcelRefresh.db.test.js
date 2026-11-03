// 엑셀 갱신 흐름: 마지막 적재일 전달·건너뛰기·임시 폴더 정리(실제 로컬 Postgres에서 커서만 읽는다). RUN_DB_TESTS=1일 때만 돈다.
import { dbTestSkip } from '../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { prisma } from '../../src/platform/prismaClient.js';
import { refreshKaptBasis } from '../../src/referenceData/kaptExcelRefresh.js';

const noImport = async () => {
  throw new Error('받지 않았으면 적재하지 않는다');
};

describe('엑셀 갱신 흐름', { skip: dbTestSkip }, () => {
  test('새 파일이 없으면 적재하지 않고 SKIPPED', async () => {
    const result = await refreshKaptBasis({ prisma, download: async () => null, runImport: noImport });
    assert.equal(result.status, 'SKIPPED');
  });

  test('받은 파일을 적재하고, 실패해도 임시 폴더를 지운다', async () => {
    let savedPath;
    const download = async ({ destDir }) => {
      savedPath = path.join(destDir, 'kapt.xlsx');
      await writeFile(savedPath, 'x');
      return { filePath: savedPath, fileDate: '2099-02-01' };
    };
    const result = await refreshKaptBasis({ prisma, download, runImport: async ({ fileDate }) => ({ fileDate, links: 1 }) });
    assert.deepEqual(result, { status: 'SUCCEEDED', fileDate: '2099-02-01', links: 1 });
    await assert.rejects(access(savedPath));

    const failing = async () => {
      throw new Error('gate');
    };
    await assert.rejects(refreshKaptBasis({ prisma, download, runImport: failing }), /gate/);
    await assert.rejects(access(savedPath));
  });
});

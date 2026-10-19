// 이미 등록된 단지에 같은 건물의 다른 키(KAPT ↔ PNU)를 별칭으로 붙이는 일회성 스크립트.
// K-apt 기본정보 백필 뒤에 실행한다. resolve와 같은 계산(getLinkedSourceKeys)·같은 붙이기(attachAliases)를 쓴다.
// 다른 단지에 이미 붙은 키는 옮기지 않고(병합하지 않음) 충돌로만 보고한다. Property 행은 건드리지 않는다.
// 실행: npm run relink:complex-aliases -w apps/api -- --dry-run   (확인 후 --dry-run 없이 실행)
// PNU 단지는 도로명주소(juso)를 단지마다 1회 부른다.
// Prisma Client는 generate 시점에 .env가 없으면 .env를 읽지 않으므로(npm install 직후 등) 직접 읽는다.
import '../src/loadEnv.js';
import { attachAliases, findKeyOwners } from '../src/domains/complexes/complexAliases.js';
import { callProvider } from '../src/domains/complexes/provider/index.js';
import { prisma } from '../src/platform/prismaClient.js';

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const complexes = await prisma.complex.findMany({
    where: { sourceKey: { not: null } },
    select: { id: true, sourceKey: true, name: true, jibunAddress: true },
    orderBy: { createdAt: 'asc' },
  });

  const summary = { complexes: complexes.length, toAttach: 0, attached: 0, conflicts: 0, undecided: 0, failed: 0 };
  for (const complex of complexes) {
    let linkedKeys;
    try {
      linkedKeys = await callProvider((provider) => provider.getLinkedSourceKeys(complex.sourceKey, complex));
    } catch (error) {
      summary.failed += 1;
      console.warn(`[relink] 실패 ${complex.sourceKey}`, error.code ?? error.name);
      continue;
    }
    if (linkedKeys.length < 2) {
      summary.undecided += 1;
      continue;
    }

    const owners = await findKeyOwners(prisma, linkedKeys);
    const others = owners.filter((owner) => owner.complexId !== complex.id);
    const missing = linkedKeys.filter((key) => !owners.some((owner) => owner.sourceKey === key));
    if (others.length > 0) {
      summary.conflicts += others.length;
      console.info(`[relink] 충돌 ${complex.sourceKey}(${complex.id}) ↔ ${others.map((o) => `${o.sourceKey}(${o.complexId})`).join(', ')}`);
    }
    if (missing.length === 0) continue;

    summary.toAttach += missing.length;
    console.info(`[relink] ${dryRun ? '추가 예정' : '추가'} ${complex.name} ${complex.sourceKey} + ${missing.join(', ')}`);
    if (!dryRun) summary.attached += (await attachAliases(prisma, complex.id, linkedKeys)).attached;
  }

  console.info(`[relink] ${dryRun ? '(dry-run) ' : ''}끝`, summary);
};

main()
  .catch((error) => {
    console.error('[relink] 실패:', error.reason ?? error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

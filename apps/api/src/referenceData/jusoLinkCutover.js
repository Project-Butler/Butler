// 공식 연계 전환·되돌리기(사람이 CLI로, prisma/jusoLinkCutover.js). 모드(env)는 바꾸지 않는다 — 기준점만 심고 안내한다.
// 전환: 일변동분 커서가 stdde X면 공식 연계 기준점을 연계 기준일 X+1로 → 다음 적용은 X+2(= stdde X+1)부터, 같은 날 두 번 적용 없음.
// 되돌리기: 공식 연계 커서가 L이면 일변동분 기준점을 stdde L-1로(이미 공식 연계가 적용한 날을 일변동분이 다시 적용하지 않게).
// 진행 중(RUNNING·PARTIAL)인 날이 있으면 거부한다 — 끝내거나 FAILED로 바꾼 뒤에.
import {
  addDays,
  findDeltaCursorDate,
  ImportGateError,
  setCursorBaseline,
  SOURCES,
  toDeltaDate,
  toLinkDate,
} from './referenceImports.js';

const assertNoneInFlight = async (prisma, source, label) => {
  const inFlight = await prisma.referenceDataImport.findFirst({
    where: { source, status: { in: ['RUNNING', 'PARTIAL'] } },
    select: { status: true, fileDate: true },
  });
  if (inFlight) {
    throw new ImportGateError(`${label} ${inFlight.status} (${inFlight.fileDate?.toISOString().slice(0, 10)}) — finish it first`);
  }
};

export const cutoverToJusoLink = async (prisma) => {
  await assertNoneInFlight(prisma, SOURCES.JUSO_DELTA, 'juso delta');
  const deltaCursor = await findDeltaCursorDate(prisma, SOURCES.JUSO_DELTA);
  if (!deltaCursor) throw new ImportGateError('no juso delta cursor — run import:juso-buildings first');
  const linkDate = toLinkDate(deltaCursor);
  const result = await setCursorBaseline(prisma, SOURCES.JUSO_LINK, linkDate, {
    reason: `superseded by cutover ${linkDate}`,
    stats: { reason: 'cutover', deltaCursor },
  });
  return { deltaCursor, linkBaseline: linkDate, nextLinkDate: addDays(linkDate, 1), ...result };
};

export const revertToJusoDelta = async (prisma) => {
  await assertNoneInFlight(prisma, SOURCES.JUSO_LINK, 'juso link');
  const linkCursor = await findDeltaCursorDate(prisma, SOURCES.JUSO_LINK);
  if (!linkCursor) throw new ImportGateError('no juso link cursor — nothing to revert');
  const deltaDate = toDeltaDate(linkCursor);
  const result = await setCursorBaseline(prisma, SOURCES.JUSO_DELTA, deltaDate, {
    reason: `superseded by revert ${deltaDate}`,
    stats: { reason: 'revert from juso link', linkCursor },
  });
  return { linkCursor, deltaBaseline: deltaDate, nextDeltaDate: addDays(deltaDate, 1), ...result };
};

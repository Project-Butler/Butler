// Created: 2026-11-19
// 계약서 OCR 하루 쪽 수 한도(사용자당 100쪽). CLOVA General OCR은 PDF를 쪽마다 1건으로 과금해서
// 요청 수가 아니라 CLOVA가 읽은 쪽 수를 센다(2026-11-19 10쪽 PDF로 확인: 콘솔 10건 증가).
// 카운터는 요청 한도와 같은 rate_limits 테이블에 행으로 둔다(테이블 구조는 그대로).
// 고정 윈도우가 UTC 기준이라 매일 09:00(KST)에 초기화된다.
import { AppError } from '../../platform/AppError.js';
import { prisma } from '../../platform/prismaClient.js';

export const DAILY_PAGE_LIMIT = 100;
const WINDOW_MS = 24 * 60 * 60 * 1000;

const keyOf = (userId) => `contract-ocr-pages:${userId}`;

const currentWindow = () => {
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);
  return { windowStart, expiresAt: new Date(windowStart.getTime() + WINDOW_MS) };
};

// used: 오늘 쓴 쪽 수, neededPages: 이번에 읽을 쪽 수(모르면 1) → 모자라면 429
export const checkPagesLeft = (used, neededPages) => {
  const left = Math.max(DAILY_PAGE_LIMIT - used, 0);
  if (left === 0) {
    throw new AppError('RATE_LIMITED', 429, `계약서로 채우기는 하루 ${DAILY_PAGE_LIMIT}쪽까지 쓸 수 있어요. 내일 오전 9시 이후에 다시 시도해 주세요.`);
  }
  if (neededPages > left) {
    throw new AppError('RATE_LIMITED', 429, `오늘은 ${left}쪽 더 읽을 수 있어요. ${left}쪽 이하로 올리거나 내일 오전 9시 이후에 다시 시도해 주세요.`);
  }
};

// CLOVA를 부르기 전에 확인만 한다(세지 않음). 쪽 수를 모르는 PDF(압축)는 1쪽으로 보고 통과시킨다.
// 카운터 저장소(DB)가 응답하지 않으면 요청 한도 미들웨어처럼 막지 않고 통과시킨다(fail open).
export const assertPagesLeft = async (userId, neededPages) => {
  let used = 0;
  try {
    const row = await prisma.rateLimit.findUnique({ where: { id: keyOf(userId) } });
    if (row && row.windowStart.getTime() === currentWindow().windowStart.getTime()) used = row.count;
  } catch (error) {
    console.error('[contractOcr/pageQuota] 카운터 읽기 실패, 요청을 통과시킴:', error.message);
    return;
  }
  checkPagesLeft(used, neededPages);
};

// CLOVA가 읽은 쪽 수만큼 더한다. LLM 단계가 실패해도 CLOVA 과금은 이미 됐으므로 OCR 직후에 부른다.
// 확인과 더하기가 한 트랜잭션이 아니라, 동시에 여러 번 보내면 한도를 조금 넘을 수 있다.
export const addUsedPages = async (userId, pages) => {
  if (pages <= 0) return;
  const id = keyOf(userId);
  const { windowStart, expiresAt } = currentWindow();
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.rateLimit.findUnique({ where: { id } });
      if (!existing || existing.windowStart.getTime() !== windowStart.getTime()) {
        await tx.rateLimit.upsert({
          where: { id },
          create: { id, count: pages, windowStart, expiresAt },
          update: { count: pages, windowStart, expiresAt },
        });
        return;
      }
      await tx.rateLimit.update({ where: { id }, data: { count: { increment: pages } } });
    });
  } catch (error) {
    console.error('[contractOcr/pageQuota] 카운터 저장 실패:', error.message);
  }
};

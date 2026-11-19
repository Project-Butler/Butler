// Created: 2026-11-19
// 계약서 OCR(B팀, #168). POST /api/v1/contract-ocr?ownershipId=… — 계약서로 계약 등록 칸 채우기.
// 저장하지 않는다. 화면이 돌려받은 값을 칸에 채우고, 임대인이 확인한 뒤 기존 계약 등록(POST /contracts)으로 저장한다.
import express, { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter, rateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { MAX_CONTRACT_FILE_BYTES, isContractFileType, mapContractFileBodyError, postContractOcr } from './controller.js';

// CLOVA·LLM이 호출마다 비용이 들어 사용자당 하루 100회로 막는다. 남용은 막고 호실이 많은 임대인도 쓸 수 있는 수준.
// 고정 윈도우가 UTC 기준이라 한도는 매일 09:00(KST)에 초기화된다. 본문을 읽기 전에 센다.
const contractOcrDailyLimiter = rateLimiter({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  keyFn: (req) => `contract-ocr:${req.user.id}`,
  message: '오늘 계약서로 채우기를 너무 많이 했어요. 내일 다시 시도해 주세요.',
});

const router = Router();

router.post(
  '/',
  authGuard,
  roleGuard(['LANDLORD']),
  generalRateLimiter,
  contractOcrDailyLimiter,
  express.raw({ type: isContractFileType, limit: MAX_CONTRACT_FILE_BYTES }),
  mapContractFileBodyError,
  postContractOcr,
);

export default router;

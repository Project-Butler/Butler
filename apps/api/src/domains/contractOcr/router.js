// Created: 2026-11-19
// 계약서 OCR(B팀, #168). POST /api/v1/contract-ocr?ownershipId=… — 계약서로 계약 등록 칸 채우기.
// 저장하지 않는다. 화면이 돌려받은 값을 칸에 채우고, 임대인이 확인한 뒤 기존 계약 등록(POST /contracts)으로 저장한다.
import express, { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { MAX_CONTRACT_FILE_BYTES, isContractFileType, mapContractFileBodyError, postContractOcr } from './controller.js';

// 하루 한도는 요청 수가 아니라 CLOVA가 읽은 쪽 수(사용자당 100쪽)로 서비스에서 센다(pageQuota.js).
const router = Router();

router.post(
  '/',
  authGuard,
  roleGuard(['LANDLORD']),
  generalRateLimiter,
  express.raw({ type: isContractFileType, limit: MAX_CONTRACT_FILE_BYTES }),
  mapContractFileBodyError,
  postContractOcr,
);

export default router;

// Created: 2026-11-19
// 계약서 OCR(B팀, #168): 계약서 파일 → CLOVA General OCR → 민감정보 삭제 → LLM 추출 → 서버 검증.
// 파일·OCR 원문·LLM 응답은 이 함수 안에서만 쓰고 저장하거나 로그에 남기지 않는다(처리 후 바로 폐기).
import { AppError } from '../../platform/AppError.js';
import { getNow } from '../../platform/dateUtils.js';
import { computeOwnershipVerificationStatus } from '../../platform/ownershipStatus.js';
import { prisma } from '../../platform/prismaClient.js';
import { readContractText } from './clovaGeneralOcr.js';
import { reviewExtractedValues } from './contractValueRules.js';
import { extractContractValues } from './extractor.js';
import { addUsedPages, assertPagesLeft } from './pageQuota.js';
import { removeSensitiveText } from './sensitiveText.js';

const throwUnreadable = () => {
  throw new AppError('CONTRACT_OCR_UNREADABLE', 422, '계약서에서 글자를 읽지 못했어요. 더 선명한 사진이나 PDF로 다시 시도해 주세요.');
};

// 계약 등록(POST /contracts)과 같은 조건: 내 소유 관계이고, 끝나지 않았고, 권리자 인증이 유효해야 한다.
// 오류 코드도 계약 등록과 같게 둬서 화면이 같은 안내를 쓸 수 있게 한다.
const findVerifiedOwnership = async (user, ownershipId) => {
  const ownership = await prisma.ownership.findUnique({
    where: { id: ownershipId },
    select: {
      userId: true,
      endedAt: true,
      verificationStatus: true,
      verificationExpiresAt: true,
      property: { select: { buildingNo: true, unitNo: true } },
      user: { select: { name: true } },
    },
  });
  if (!ownership || ownership.userId !== user.id) {
    throw new AppError('OWNERSHIP_NOT_FOUND', 404, '소유 관계를 찾을 수 없습니다.');
  }
  if (ownership.endedAt) {
    throw new AppError('OWNERSHIP_ENDED', 422, '이미 종료된 소유 관계입니다.');
  }
  if (computeOwnershipVerificationStatus(ownership, getNow()) !== 'VERIFIED') {
    throw new AppError('OWNERSHIP_VERIFICATION_REQUIRED', 403, '권리자 인증을 마친 호실만 계약서로 채울 수 있습니다.');
  }
  return ownership;
};

// file: Buffer, format: 'jpg' | 'png' | 'pdf', knownPages: 서버가 미리 센 쪽 수(모르면 0)
// → { fields: { leaseType, deposit, monthlyRent, rentPaymentDay, startDate, endDate, tenantName, tenantPhone, memo }, memoTruncated, warnings }
export const readContract = async (user, { ownershipId, file, format, knownPages }) => {
  const ownership = await findVerifiedOwnership(user, ownershipId);

  // 하루 100쪽 한도: 보내기 전엔 남은 쪽만 확인하고, CLOVA가 읽은 실제 쪽 수를 OCR 직후에 더한다.
  await assertPagesLeft(user.id, Math.max(knownPages, 1));
  const { text: ocrText, pageCount } = await readContractText({ file, format });
  await addUsedPages(user.id, pageCount);
  const text = removeSensitiveText(ocrText);
  if (!text.trim()) throwUnreadable();

  const extracted = await extractContractValues(text);
  return reviewExtractedValues({
    text,
    extracted,
    property: ownership.property,
    landlordName: ownership.user.name,
  });
};

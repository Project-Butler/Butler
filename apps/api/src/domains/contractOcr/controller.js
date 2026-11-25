// Created: 2026-11-19
// POST /api/v1/contract-ocr?ownershipId=… 요청 형식 검사. 본문은 계약서 파일 원문 바이트(Content-Type: 파일 형식)다.
// JSON(base64)으로 받으면 크기가 1.3배가 돼 Vercel 함수 요청 본문 한도(약 4.5MB)에 걸려서 원문 그대로 받는다.
import { AppError } from '../../platform/AppError.js';
import { throwIfInvalid } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import { readContract } from './service.js';

export const MAX_CONTRACT_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_PDF_PAGES = 5;

// Content-Type → CLOVA format. 파일 앞 바이트(매직 넘버)도 같은 형식이어야 받는다.
const FILE_TYPES = {
  'image/jpeg': { format: 'jpg', matches: (file) => file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff },
  'image/png': { format: 'png', matches: (file) => file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'application/pdf': { format: 'pdf', matches: (file) => file.subarray(0, 5).toString('latin1') === '%PDF-' },
};

export const isContractFileType = (req) => Object.hasOwn(FILE_TYPES, getMimeType(req));

const getMimeType = (req) => String(req.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();

const throwUnsupported = () => {
  throw new AppError('CONTRACT_OCR_UNSUPPORTED_FILE', 422, 'JPG · PNG 사진이나 PDF만 올릴 수 있어요.');
};

// PDF 쪽 수(/Type /Page 개수). 쪽 정보가 압축돼 있어 셀 수 없으면 0이고, 그때는 CLOVA 한도(10쪽)에 맡긴다.
export const countPdfPages = (file) => (file.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;

// express.raw의 크기 초과(413)는 공통 처리에서 400이 되므로 여기서 422로 바꾼다.
export const mapContractFileBodyError = (error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    next(new AppError('CONTRACT_OCR_FILE_TOO_LARGE', 422, '파일은 4MB까지 올릴 수 있어요.'));
    return;
  }
  next(error);
};

export const postContractOcr = async (req, res, next) => {
  try {
    const { ownershipId } = req.query;
    if (!isUuid(ownershipId)) throwIfInvalid([{ field: 'ownershipId', reason: 'UUID여야 합니다.' }]);

    const type = FILE_TYPES[getMimeType(req)];
    const file = req.body;
    if (!type) throwUnsupported();
    if (!Buffer.isBuffer(file) || file.length === 0) {
      throw new AppError('CONTRACT_OCR_FILE_REQUIRED', 400, '계약서 파일을 선택해 주세요.');
    }
    if (!type.matches(file)) throwUnsupported();
    // 사진은 1쪽. PDF 쪽 수를 셀 수 없으면 0(하루 쪽 한도 확인 때 1쪽으로 본다).
    const knownPages = type.format === 'pdf' ? countPdfPages(file) : 1;
    if (knownPages > MAX_PDF_PAGES) {
      throw new AppError('CONTRACT_OCR_TOO_MANY_PAGES', 422, `PDF는 ${MAX_PDF_PAGES}쪽까지 올릴 수 있어요.`);
    }

    sendData(res, await readContract(req.user, { ownershipId, file, format: type.format, knownPages }));
  } catch (error) {
    next(error);
  }
};

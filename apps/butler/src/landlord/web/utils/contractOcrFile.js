// Created: 2026-11-19
// 계약서 OCR(B팀, #168)에 올릴 파일 준비. 서버 한도(4MB · PDF 5쪽, Vercel 요청 본문 한도 약 4.5MB)에 맞춘다.
// PDF는 그대로 보낸다. 사진(최대 5장, #181)은 JPEG로 줄인 뒤 사진 1장 = 1쪽인 PDF 하나로 묶어 보낸다.
// CLOVA General OCR은 요청 하나에 이미지 1장만 받아서, 여러 장을 한 번에 읽히려고 PDF로 묶는다.
// (2026-11-20 확인: 사진을 그대로 보낸 것과 PDF로 묶은 것의 인식 결과가 같았다.)
import { buildJpegPdf } from './jpegPdf';

export const CONTRACT_OCR_ACCEPT = 'image/jpeg,image/png,application/pdf';
export const MAX_CONTRACT_OCR_BYTES = 4 * 1024 * 1024;
export const MAX_CONTRACT_OCR_PHOTOS = 5;

const IMAGE_TYPES = ['image/jpeg', 'image/png'];
// 합친 PDF가 4MB를 넘으면 긴 변을 한 단계씩 줄여 다시 만든다(폰 사진 원본은 3~6MB가 흔하다).
const IMAGE_SIDE_STEPS = [2000, 1600, 1280];
const JPEG_QUALITY = 0.85;

export const isContractOcrPhoto = (file) => IMAGE_TYPES.includes(file.type);
export const isContractOcrPdf = (file) => file.type === 'application/pdf';

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_LOAD_FAILED'));
    };
    image.src = url;
  });

// image → { data: JPEG 바이트(Uint8Array), width, height }
const encodeJpeg = async (image, maxSide) => {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  // PNG의 투명한 부분이 검게 나오지 않게 흰 바탕을 깐다.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('IMAGE_ENCODE_FAILED');
  return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
};

// PDF 1개 → { file } 또는 { error: 화면 문구 }
export const prepareContractOcrPdf = (file) => {
  if (!isContractOcrPdf(file)) return { error: 'JPG · PNG 사진이나 PDF만 올릴 수 있어요.' };
  if (file.size > MAX_CONTRACT_OCR_BYTES) return { error: 'PDF는 4MB까지 올릴 수 있어요.' };
  return { file };
};

// 사진 여러 장(고른 순서 = 쪽 순서) → { file: PDF Blob } 또는 { error: 화면 문구 }
export const prepareContractOcrPhotos = async (files) => {
  if (files.length === 0) return { error: '계약서 사진을 골라 주세요.' };
  if (files.length > MAX_CONTRACT_OCR_PHOTOS) return { error: `사진은 ${MAX_CONTRACT_OCR_PHOTOS}장까지 올릴 수 있어요.` };
  if (!files.every(isContractOcrPhoto)) return { error: 'JPG · PNG 사진이나 PDF만 올릴 수 있어요.' };

  let images;
  try {
    images = await Promise.all(files.map(loadImage));
  } catch {
    return { error: '사진을 열지 못했어요. 다른 사진으로 다시 시도해 주세요.' };
  }

  try {
    for (const maxSide of IMAGE_SIDE_STEPS) {
      const pages = [];
      // 한꺼번에 줄이면 폰에서 메모리가 모자랄 수 있어 한 장씩 줄인다.
      for (const image of images) pages.push(await encodeJpeg(image, maxSide));
      const pdf = buildJpegPdf(pages);
      if (pdf.size <= MAX_CONTRACT_OCR_BYTES) return { file: pdf };
    }
  } catch {
    return { error: '사진을 열지 못했어요. 다른 사진으로 다시 시도해 주세요.' };
  }
  return { error: '사진이 너무 커요. 사진 장 수를 줄여 다시 시도해 주세요.' };
};

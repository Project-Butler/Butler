// Created: 2026-11-19
// 계약서 OCR(B팀, #168)에 올릴 파일 준비. 서버 한도(4MB · PDF 5쪽, Vercel 요청 본문 한도 약 4.5MB)에 맞춘다.
// 사진은 긴 변 2,000px의 JPEG로 줄여 보낸다(폰 사진은 3~6MB가 흔하다). PDF는 그대로 보낸다.

export const CONTRACT_OCR_ACCEPT = 'image/jpeg,image/png,application/pdf';
export const MAX_CONTRACT_OCR_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const MAX_IMAGE_SIDE = 2000;
const JPEG_QUALITY = 0.85;

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

const shrinkImage = async (file) => {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
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
  return blob;
};

// → { file } 또는 { error: 화면 문구 }
export const prepareContractOcrFile = async (file) => {
  const isImage = IMAGE_TYPES.includes(file.type);
  if (!isImage && file.type !== 'application/pdf') return { error: 'JPG · PNG 사진이나 PDF만 올릴 수 있어요.' };

  let prepared = file;
  if (isImage) {
    try {
      prepared = await shrinkImage(file);
    } catch {
      return { error: '사진을 열지 못했어요. 다른 사진으로 다시 시도해 주세요.' };
    }
  }
  if (prepared.size > MAX_CONTRACT_OCR_BYTES) {
    return { error: isImage ? '사진이 너무 커요. 더 작은 사진으로 다시 시도해 주세요.' : 'PDF는 4MB까지 올릴 수 있어요.' };
  }
  return { file: prepared };
};

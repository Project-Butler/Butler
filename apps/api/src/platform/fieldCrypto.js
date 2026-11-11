// 개인정보 필드(휴대폰 번호 등)의 애플리케이션 레벨 암호화(docs/02-backend.md "민감 정보는 암호화").
// AES-256-GCM. 저장 형식: "enc:v1:<iv hex>:<auth tag hex>:<암호문 hex>". 키는 환경변수 FIELD_ENCRYPTION_KEY(hex 64자).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { AppError } from './AppError.js';

const PREFIX = 'enc:v1:';
const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

// 키는 요청 시점에 읽는다(테스트·로컬에서 env를 나중에 채워도 동작하게).
const getKey = () => {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw || !KEY_HEX_PATTERN.test(raw)) {
    // 키 없이 평문으로 저장하느니 가입을 실패시킨다(fail closed). 메시지는 서버 로그에만 의미가 있다.
    console.error('[fieldCrypto] FIELD_ENCRYPTION_KEY가 없거나 hex 64자가 아닙니다.');
    throw new AppError('INTERNAL_ERROR', 500, '서버 설정에 문제가 있습니다. 잠시 후 다시 시도해주세요.');
  }
  return Buffer.from(raw, 'hex');
};

export const encryptField = (plainText) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
};

// 용도별 암호화(쿠키 등 DB 밖 값). FIELD_ENCRYPTION_KEY에서 HKDF로 용도별 키를 따로 만들어,
// 한 용도의 암호문을 다른 용도(개인정보 필드 포함)에서 복호화할 수 없게 한다. 형식: "<iv>.<auth tag>.<암호문>"(base64url).
const purposeKey = (purpose) => {
  if (typeof purpose !== 'string' || purpose === '') throw new TypeError('purpose가 필요합니다.');
  return Buffer.from(hkdfSync('sha256', getKey(), Buffer.alloc(0), `butler:${purpose}`, 32));
};

export const encryptWithPurpose = (purpose, plainText) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', purposeKey(purpose), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
};

// 없거나 형식이 틀리거나 변조·다른 용도의 값이면 null. 키 설정 오류(500)는 그대로 던진다.
export const decryptWithPurpose = (purpose, cipherText) => {
  const key = purposeKey(purpose);
  if (typeof cipherText !== 'string') return null;
  const parts = cipherText.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};

// 복호화 실패(키 교체·변조)는 응답 전체를 깨뜨리지 않도록 null로 돌려주고 로그만 남긴다.
// "enc:v1:" 접두사가 없는 값은 암호화 도입 전에 저장된 평문(로컬 시드 등)이라 그대로 돌려준다.
export const decryptField = (stored) => {
  if (stored === null || stored === undefined) return null;
  if (!stored.startsWith(PREFIX)) return stored;

  try {
    const [ivHex, tagHex, dataHex] = stored.slice(PREFIX.length).split(':');
    const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch (error) {
    console.error('[fieldCrypto] 복호화 실패:', error.message);
    return null;
  }
};

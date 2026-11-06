import { describe, expect, it } from 'vitest';
import {
  checkAttachmentFile,
  formatAttachmentCount,
  formatFileSize,
  isRenderableImage,
  MAX_ATTACHMENT_BYTES,
  resolveFileMimeType,
  toDocumentType,
} from '../../src/utils/attachment';

const fakeFile = (name, type, size = 1000) => ({ name, type, size });

describe('resolveFileMimeType', () => {
  it('허용 형식은 브라우저가 준 값을 쓴다', () => {
    expect(resolveFileMimeType(fakeFile('a.jpg', 'image/jpeg'))).toBe('image/jpeg');
    expect(resolveFileMimeType(fakeFile('a.pdf', 'application/pdf'))).toBe('application/pdf');
  });
  it('형식이 비어 있으면 확장자로 고른다(Windows HEIC)', () => {
    expect(resolveFileMimeType(fakeFile('IMG_0001.HEIC', ''))).toBe('image/heic');
    expect(resolveFileMimeType(fakeFile('scan.Pdf', ''))).toBe('application/pdf');
  });
  it('허용 밖이면 null', () => {
    expect(resolveFileMimeType(fakeFile('a.gif', 'image/gif'))).toBeNull();
    expect(resolveFileMimeType(fakeFile('a.exe', ''))).toBeNull();
  });
});

describe('checkAttachmentFile', () => {
  it('형식·크기를 미리 검사한다', () => {
    expect(checkAttachmentFile(fakeFile('a.jpg', 'image/jpeg'))).toBeNull();
    expect(checkAttachmentFile(fakeFile('a.gif', 'image/gif'))).toContain('JPEG·PNG·WEBP·HEIC');
    expect(checkAttachmentFile(fakeFile('big.jpg', 'image/jpeg', MAX_ATTACHMENT_BYTES + 1))).toContain('20MB');
    expect(checkAttachmentFile(fakeFile('empty.jpg', 'image/jpeg', 0))).toContain('빈 파일');
  });
});

describe('표시 함수', () => {
  it('HEIC·PDF는 썸네일 대신 다운로드 링크', () => {
    expect(isRenderableImage('image/png')).toBe(true);
    expect(isRenderableImage('image/heic')).toBe(false);
    expect(isRenderableImage('application/pdf')).toBe(false);
  });
  it('문서 유형: PDF는 OTHER, 사진은 PHOTO', () => {
    expect(toDocumentType('application/pdf')).toBe('OTHER');
    expect(toDocumentType('image/heic')).toBe('PHOTO');
  });
  it('목록에는 개수만', () => {
    expect(formatAttachmentCount([])).toBeNull();
    expect(formatAttachmentCount(undefined)).toBeNull();
    expect(formatAttachmentCount([{}, {}, {}])).toBe('사진 3장');
  });
  it('파일 크기', () => {
    expect(formatFileSize(1536 * 1024)).toBe('1.5MB');
    expect(formatFileSize(2048)).toBe('2KB');
    expect(formatFileSize(10)).toBe('1KB');
  });
});

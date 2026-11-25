import { describe, expect, it } from 'vitest';
import {
  allowedFileKinds,
  buildAttachmentAccept,
  checkAttachmentFile,
  DEFAULT_UPLOAD_RULES,
  describeAttachmentLimits,
  describeDocumentBoxFileLimits,
  formatAttachmentCount,
  formatFileSize,
  isRenderableImage,
  MAX_ATTACHMENT_BYTES,
  resolveFileMimeType,
  toDocumentType,
} from '../../src/shared/upload/attachment';

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

describe('동영상 규칙', () => {
  const MB = 1024 * 1024;
  const withVideo = ['IMAGE', 'PDF', 'VIDEO'];
  it('mp4·mov·m4v는 확장자로도 동영상 형식을 고른다', () => {
    expect(resolveFileMimeType(fakeFile('a.MOV', ''))).toBe('video/quicktime');
    expect(resolveFileMimeType(fakeFile('a.m4v', ''))).toBe('video/mp4');
    expect(resolveFileMimeType(fakeFile('a.mp4', 'video/mp4'))).toBe('video/mp4');
  });
  it('기본(사진·PDF)은 동영상을 거절하고, 동영상을 받는 곳은 50MB까지', () => {
    expect(checkAttachmentFile(fakeFile('a.mp4', 'video/mp4'))).toContain('사진과 PDF만');
    expect(checkAttachmentFile(fakeFile('a.mp4', 'video/mp4', 50 * MB), { kinds: withVideo })).toBeNull();
    expect(checkAttachmentFile(fakeFile('a.mp4', 'video/mp4', 50 * MB + 1), { kinds: withVideo })).toContain('동영상은 50MB');
    // 사진 한도는 그대로 20MB
    expect(checkAttachmentFile(fakeFile('a.jpg', 'image/jpeg', 20 * MB + 1), { kinds: withVideo })).toContain('20MB');
  });
  it('위치별 묶음·accept·안내 문구', () => {
    const rules = { ...DEFAULT_UPLOAD_RULES, resourceKinds: { TICKET: withVideo } };
    expect(allowedFileKinds(rules, 'TICKET')).toEqual(withVideo);
    expect(allowedFileKinds(rules, 'MANAGEMENT_LOG')).toEqual(['IMAGE', 'PDF']);
    expect(allowedFileKinds(rules)).toEqual(['IMAGE', 'PDF']);
    expect(buildAttachmentAccept(rules, withVideo)).toContain('.mov');
    expect(buildAttachmentAccept(rules)).not.toContain('video');
    expect(describeAttachmentLimits(rules)).toBe('JPEG·PNG·WEBP·HEIC 사진과 PDF, 한 파일 20MB까지 붙일 수 있어요.');
    expect(describeDocumentBoxFileLimits(rules)).toBe('PDF·JPG·PNG·WEBP·HEIC 20MB까지');
    expect(describeDocumentBoxFileLimits(rules, withVideo)).toBe('PDF·JPG·PNG·WEBP·HEIC 20MB, MP4·MOV 50MB까지');
  });
  it('동영상이 섞이면 개수는 첨부 n개', () => {
    expect(formatAttachmentCount([{ mimeType: 'image/jpeg' }, { mimeType: 'video/mp4' }])).toBe('첨부 2개');
    expect(toDocumentType('video/mp4')).toBe('PHOTO');
  });
});

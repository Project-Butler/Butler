// 임시 로컬 저장소(STORAGE_DRIVER=local). 서버 디스크에 파일을 두고, 업로드·다운로드는 이 API의 서명 경로로 한다.
// 배포 환경은 같은 함수 모양의 Supabase Storage 드라이버(supabase.js)를 쓴다(화면·서비스는 그대로).
// uploadUrl·downloadUrl은 API 기준 상대 경로다. 화면은 VITE_SERVER_API_URL 기준으로 절대 주소로 바꿔 쓴다(api-client).
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStoragePath, matchesDeclaredType, SIGNATURE_PEEK_BYTES } from '../fileRules.js';
import { createStorageToken, verifyStorageToken } from './signature.js';

// 기본 폴더 apps/api/.storage (gitignore). LOCAL_STORAGE_DIR로 바꿀 수 있다(결정 Q1).
export const DEFAULT_LOCAL_STORAGE_DIR = fileURLToPath(new URL('../../../../.storage', import.meta.url));

const API_PREFIX = '/api/v1';

export const createLocalStorage = ({ dir = DEFAULT_LOCAL_STORAGE_DIR, secret }) => {
  const root = path.resolve(dir);
  const toFilePath = (storagePath) => {
    if (!isStoragePath(storagePath)) throw new Error('잘못된 저장 경로');
    return path.join(root, ...storagePath.split('/'));
  };

  return {
    kind: 'local',
    // 이 API가 업로드 본문과 다운로드 내용을 직접 주고받는다.
    servesContent: true,

    createUploadTarget: ({ uploadId, mimeType, expiresAt }) => {
      const token = createStorageToken({ secret, purpose: 'upload', id: uploadId, expiresAt });
      return {
        uploadUrl: `${API_PREFIX}/files/upload-sessions/${uploadId}/content?token=${token}`,
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
      };
    },

    verifyUploadToken: ({ uploadId, token, now }) =>
      verifyStorageToken({ secret, purpose: 'upload', id: uploadId, token, nowMs: now.getTime() }),

    createDownloadUrl: ({ documentId, expiresAt }) => {
      const token = createStorageToken({ secret, purpose: 'download', id: documentId, expiresAt });
      return `${API_PREFIX}/documents/${documentId}/content?token=${token}`;
    },

    verifyDownloadToken: ({ documentId, token, now }) =>
      verifyStorageToken({ secret, purpose: 'download', id: documentId, token, nowMs: now.getTime() }),

    // 임시 파일에 쓰고 이름을 바꿔 반쯤 쓴 파일이 보이지 않게 한다. 같은 업로드를 동시에 써도 겹치지 않게 임시 파일 이름은 요청마다 다르다.
    writeObject: async (storagePath, buffer) => {
      const filePath = toFilePath(storagePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      const partPath = `${filePath}.${randomUUID()}.part`;
      try {
        await writeFile(partPath, buffer);
        await rename(partPath, filePath);
      } catch (error) {
        await rm(partPath, { force: true });
        throw error;
      }
    },

    // 파일이 있고 크기·형식이 맞는지. 없으면 false.
    confirmObject: async ({ storagePath, sizeBytes, mimeType }) => {
      const filePath = toFilePath(storagePath);
      let handle;
      try {
        const info = await stat(filePath);
        if (info.size !== Number(sizeBytes)) return false;
        handle = await open(filePath, 'r');
        const head = Buffer.alloc(SIGNATURE_PEEK_BYTES);
        await handle.read(head, 0, SIGNATURE_PEEK_BYTES, 0);
        return matchesDeclaredType(head, mimeType);
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
      } finally {
        await handle?.close();
      }
    },

    openObjectStream: (storagePath) => createReadStream(toFilePath(storagePath)),

    // 이미 없으면 그대로 끝난다.
    deleteObject: async (storagePath) => {
      const filePath = toFilePath(storagePath);
      await rm(filePath, { force: true });
    },
  };
};

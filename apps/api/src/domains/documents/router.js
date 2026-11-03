import express, { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { MAX_FILE_BYTES } from './fileRules.js';
import {
  getDocument,
  getDocumentContent,
  listDocuments,
  postDocument,
  postDownloadUrl,
  postUploadSession,
  putUploadContent,
  removeDocument,
} from './controller.js';

// api-contract.md 6장 "파일 · 문서". 볼 수 없는 문서는 404로 숨긴다.
export const filesRouter = Router();
filesRouter.use(authGuard, generalRateLimiter);
filesRouter.post('/upload-sessions', postUploadSession);

const documentsRouter = Router();
documentsRouter.use(authGuard, generalRateLimiter);
documentsRouter.post('/', postDocument);
documentsRouter.get('/', listDocuments);
documentsRouter.get('/:documentId', getDocument);
documentsRouter.post('/:documentId/download-url', postDownloadUrl);
documentsRouter.delete('/:documentId', removeDocument);

export default documentsRouter;

// 임시 로컬 저장소의 서명 경로(업로드 본문 PUT, 다운로드 GET). 브라우저가 서명 주소로 직접 부르므로 쿠키·CSRF 헤더 대신
// 서명으로 판단한다. 업로드 본문은 원문 바이트(최대 20MB, 결정 Q4)라 express.json·csrfGuard보다 앞에 둔다(app.js).
// /api/v1 아래에 붙이고 이 두 경로만 받는다.
export const storageContentRouter = Router();
storageContentRouter.put(
  '/files/upload-sessions/:uploadId/content',
  express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
  putUploadContent,
);
storageContentRouter.get('/documents/:documentId/content', getDocumentContent);

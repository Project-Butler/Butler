import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteDocument, postDocument, postUploadSession, putUploadContent } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';
import { checkAttachmentFile, isRenderableImage, MAX_LOG_ATTACHMENTS, resolveFileMimeType, toDocumentType } from '../utils/attachment';

let nextKey = 0;
const newKey = () => {
  nextKey += 1;
  return `upload-${nextKey}`;
};

// 이미 붙은 문서(수정 화면)를 목록 항목으로
const toExistingItem = (attachment) => ({
  key: attachment.id,
  documentId: attachment.id,
  fileName: attachment.fileName,
  mimeType: attachment.mimeType,
  sizeBytes: attachment.sizeBytes,
  isLocked: attachment.isLocked,
  status: 'done',
  progress: 1,
  previewUrl: null,
  error: null,
});

// 관리 로그 사진 첨부 업로드 상태.
// 순서: 업로드 세션 발급 → uploadUrl로 PUT → POST /documents(리소스 없이 = 미연결 문서).
// 기록은 아직 없을 수도 있어서(작성 화면) 문서를 먼저 미연결로 등록하고, 저장할 때 attachmentDocumentIds로 한꺼번에 붙인다.
// 수정 화면도 같은 방식이다 — 저장할 때 최종 목록을 보내면 서버가 빠진 문서는 지우고 새 문서는 붙인다(저장 전 취소하면 그대로).
// 저장소를 쓸 수 없는 환경(503 STORAGE_UNAVAILABLE)이면 storageUnavailable이 true가 되고, 글 작성은 그대로 된다.
export const useAttachmentUploads = (initialAttachments = [], { onUnauthorized } = {}) => {
  const [items, setItems] = useState(() => initialAttachments.map(toExistingItem));
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [notice, setNotice] = useState(null);
  const existingIds = useRef(new Set(initialAttachments.map((attachment) => attachment.id)));
  const previewUrls = useRef(new Set());
  // 올리는 중에 뺀 항목. 등록 전이면 등록하지 않고, 이미 등록됐으면 바로 지운다.
  const cancelledKeys = useRef(new Set());

  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const patchItem = useCallback((key, patch) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const dropItem = useCallback((key) => {
    setItems((prev) => {
      const target = prev.find((item) => item.key === key);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrls.current.delete(target.previewUrl);
      }
      return prev.filter((item) => item.key !== key);
    });
  }, []);

  const upload = useCallback(
    async (key, file, mimeType) => {
      try {
        const session = await postUploadSession({ fileName: file.name, mimeType, sizeBytes: file.size, documentType: toDocumentType(mimeType) });
        await putUploadContent(session, file, { onProgress: (progress) => patchItem(key, { progress }) });
        // 등록 안 한 업로드 세션은 서버 정리 작업이 지운다.
        if (cancelledKeys.current.delete(key)) return;
        const document = await postDocument({ uploadSessionId: session.id });
        if (cancelledKeys.current.delete(key)) {
          deleteDocument(document.id).catch(() => {});
          return;
        }
        patchItem(key, { documentId: document.id, status: 'done', progress: 1 });
      } catch (error) {
        cancelledKeys.current.delete(key);
        const apiError = toApiError(error);
        // 로그인이 풀려도 올리는 중으로 남겨 두지 않는다(저장 버튼이 계속 막히지 않게).
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          patchItem(key, { status: 'error', error: apiError.message });
          return;
        }
        if (apiError.code === 'STORAGE_UNAVAILABLE') {
          setStorageUnavailable(true);
          dropItem(key);
          return;
        }
        patchItem(key, { status: 'error', error: apiError.message });
      }
    },
    [dropItem, onUnauthorized, patchItem],
  );

  const addFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList);
      const room = MAX_LOG_ATTACHMENTS - items.length;
      const messages = [];
      if (files.length > room) messages.push(`사진은 기록 하나에 ${MAX_LOG_ATTACHMENTS}장까지 붙일 수 있어요.`);
      const accepted = [];
      for (const file of files.slice(0, Math.max(room, 0))) {
        const problem = checkAttachmentFile(file);
        if (problem) messages.push(problem);
        else accepted.push(file);
      }
      setNotice(messages.length > 0 ? messages.join(' ') : null);

      const added = accepted.map((file) => {
        const mimeType = resolveFileMimeType(file);
        const previewUrl = isRenderableImage(mimeType) ? URL.createObjectURL(file) : null;
        if (previewUrl) previewUrls.current.add(previewUrl);
        return {
          item: {
            key: newKey(),
            documentId: null,
            fileName: file.name,
            mimeType,
            sizeBytes: file.size,
            isLocked: false,
            status: 'uploading',
            progress: 0,
            previewUrl,
            error: null,
          },
          file,
        };
      });
      setItems((prev) => [...prev, ...added.map(({ item }) => item)]);
      for (const { item, file } of added) upload(item.key, file, item.mimeType);
    },
    [items.length, upload],
  );

  // 이번에 새로 올린 문서는 바로 지운다(미연결이라 남겨 둬도 24시간 뒤 정리되지만 빨리 치운다). 이미 붙은 문서는 저장할 때 서버가 지운다.
  const remove = useCallback(
    (key) => {
      const target = items.find((item) => item.key === key);
      if (target?.status === 'uploading') cancelledKeys.current.add(key);
      if (target?.documentId && !existingIds.current.has(target.documentId)) {
        deleteDocument(target.documentId).catch(() => {});
      }
      dropItem(key);
    },
    [dropItem, items],
  );

  const doneItems = items.filter((item) => item.status === 'done');
  return {
    items,
    addFiles,
    remove,
    notice,
    storageUnavailable,
    isUploading: items.some((item) => item.status === 'uploading'),
    hasFailed: items.some((item) => item.status === 'error'),
    documentIds: doneItems.map((item) => item.documentId),
  };
};

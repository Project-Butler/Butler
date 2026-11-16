import { useCallback, useEffect, useRef, useState } from 'react';
import { postDocument, postUploadSession, putUploadContent } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';
import { checkAttachmentFile, resolveFileMimeType } from '../utils/attachment';
import { MAX_FILES_PER_BATCH } from '../utils/documentBox';

let nextKey = 0;
const newKey = () => {
  nextKey += 1;
  return `document-box-upload-${nextKey}`;
};

const STORAGE_UNAVAILABLE_MESSAGE = '지금은 파일을 올릴 수 없어요. 잠시 뒤에 다시 시도해 주세요.';

// 서류 올리기 팝업의 업로드. 고른 직후는 '대기'(status pending)이고, [저장]을 누를 때 파일마다 순서대로
// 업로드 세션(documentType) → PUT → POST /documents(resourceType·resourceId)를 한다. 올린 파일은 목록에서 빠지고 실패한 파일만 남는다.
// useContractDocumentUploads의 오류 처리(toApiError·isUnauthorizedError·STORAGE_UNAVAILABLE 안내)를 따르되 올릴 곳은 저장할 때 받는다.
// items: { key, file, fileName, sizeBytes, mimeType, status: 'pending' | 'uploading' | 'error', progress, error }
export const useDocumentBoxUploads = ({ onUnauthorized } = {}) => {
  const [items, setItems] = useState([]);
  const [notice, setNotice] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const isUnmountedRef = useRef(false);
  // StrictMode(개발)는 effect를 mount → cleanup → mount로 돌리므로 mount 때 다시 false로 둔다.
  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
    };
  }, []);

  const patchItem = useCallback((key, patch) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  // capacity: 지금 더 고를 수 있는 파일 수(남은 자리·한 번에 최대 10개 반영). 넘는 파일은 담지 않고 안내한다.
  const addFiles = useCallback((fileList, capacity) => {
    const messages = [];
    const accepted = [];
    for (const file of Array.from(fileList)) {
      const problem = checkAttachmentFile(file);
      if (problem) messages.push(problem);
      else accepted.push(file);
    }
    const allowed = Math.max(0, capacity);
    if (accepted.length > allowed) {
      messages.push(
        allowed === 0
          ? '더 담을 수 없어요. 한 번에 10개까지, 한 곳에 30개까지 올릴 수 있어요.'
          : `한 번에 ${MAX_FILES_PER_BATCH}개까지, 남은 자리만큼만 올릴 수 있어서 ${allowed}개만 담았어요.`,
      );
    }
    setNotice(messages.length > 0 ? messages.join(' ') : null);
    setItems((prev) => [
      ...prev,
      ...accepted.slice(0, allowed).map((file) => ({
        key: newKey(),
        file,
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: resolveFileMimeType(file),
        status: 'pending',
        progress: 0,
        error: null,
      })),
    ]);
  }, []);

  const removeItem = useCallback((key) => setItems((prev) => prev.filter((item) => item.key !== key)), []);

  // 대기·실패한 파일을 순서대로 올린다. 돌려주는 값: { uploadedCount, failedCount }.
  // 저장소를 쓸 수 없으면(STORAGE_UNAVAILABLE) 나머지도 같은 오류라 멈추고, 401이면 멈추고 onUnauthorized를 부른다.
  const save = useCallback(
    async ({ resourceType, resourceId, documentType }) => {
      setIsSaving(true);
      setNotice(null);
      let uploadedCount = 0;
      let failedCount = 0;
      const queue = itemsRef.current.filter((item) => item.status !== 'uploading');
      for (const [index, item] of queue.entries()) {
        if (isUnmountedRef.current) break;
        patchItem(item.key, { status: 'uploading', progress: 0, error: null });
        try {
          const session = await postUploadSession({ fileName: item.fileName, mimeType: item.mimeType, sizeBytes: item.sizeBytes, documentType });
          await putUploadContent(session, item.file, { onProgress: (progress) => patchItem(item.key, { progress }) });
          await postDocument({ uploadSessionId: session.id, resourceType, resourceId });
          setItems((prev) => prev.filter((current) => current.key !== item.key));
          uploadedCount += 1;
        } catch (error) {
          const apiError = toApiError(error);
          failedCount += 1;
          if (isUnauthorizedError(error)) {
            patchItem(item.key, { status: 'error', error: apiError.message });
            onUnauthorized?.();
            break;
          }
          const isStorageDown = apiError.code === 'STORAGE_UNAVAILABLE';
          patchItem(item.key, { status: 'error', error: isStorageDown ? STORAGE_UNAVAILABLE_MESSAGE : apiError.message });
          if (isStorageDown) {
            setNotice(STORAGE_UNAVAILABLE_MESSAGE);
            // 남은 파일은 시도하지 않고 대기로 둔다(다시 저장하면 이어서 올린다).
            failedCount += queue.length - index - 1;
            break;
          }
        }
      }
      if (!isUnmountedRef.current) setIsSaving(false);
      return { uploadedCount, failedCount };
    },
    [onUnauthorized, patchItem],
  );

  return { items, notice, isSaving, addFiles, removeItem, save };
};

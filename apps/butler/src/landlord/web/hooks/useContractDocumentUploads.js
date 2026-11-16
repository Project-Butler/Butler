import { useCallback, useEffect, useRef, useState } from 'react';
import { postDocument, postUploadSession, putUploadContent } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';
import { checkContractFile, isContractPhoto, resolveContractFileMimeType } from '../utils/tenantInvite';

let nextKey = 0;
const newKey = () => {
  nextKey += 1;
  return `contract-upload-${nextKey}`;
};

// 초대 팝업(A2)의 계약서 올리기. 순서: 업로드 세션(CONTRACT_DOCUMENT) → PUT → POST /documents(resourceType CONTRACT).
// 계약 서류함에 바로 붙으므로 초대를 만들지 않아도 남는다. 다 올라가면 onUploaded(document)로 알려 선택 상태로 만든다.
// items: 올리는 중·실패한 파일만(다 올라간 파일은 uploaded로 옮겨 서류함 목록과 합쳐 그린다).
// previewUrls: 문서 id → 내 컴퓨터의 사진 주소(서버 주소를 다시 받지 않고 바로 그린다).
export const useContractDocumentUploads = (contractId, { onUploaded, onUnauthorized } = {}) => {
  const [items, setItems] = useState([]);
  const [uploaded, setUploaded] = useState([]);
  const [notice, setNotice] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
  const createdUrls = useRef(new Set());
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  });

  useEffect(
    () => () => {
      for (const url of createdUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const patchItem = useCallback((key, patch) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const upload = useCallback(
    async (key, file, mimeType, previewUrl) => {
      try {
        const session = await postUploadSession({ fileName: file.name, mimeType, sizeBytes: file.size, documentType: 'CONTRACT_DOCUMENT' });
        await putUploadContent(session, file, { onProgress: (progress) => patchItem(key, { progress }) });
        const document = await postDocument({ uploadSessionId: session.id, resourceType: 'CONTRACT', resourceId: contractId });
        if (previewUrl) setPreviewUrls((prev) => ({ ...prev, [document.id]: previewUrl }));
        setItems((prev) => prev.filter((item) => item.key !== key));
        setUploaded((prev) => [...prev, document]);
        onUploadedRef.current?.(document);
      } catch (error) {
        const apiError = toApiError(error);
        if (isUnauthorizedError(error)) onUnauthorized?.();
        patchItem(key, {
          status: 'error',
          error: apiError.code === 'STORAGE_UNAVAILABLE' ? '지금은 파일을 올릴 수 없어요. 계약서 없이도 초대할 수 있어요.' : apiError.message,
        });
      }
    },
    [contractId, onUnauthorized, patchItem],
  );

  const addFiles = useCallback(
    (fileList) => {
      const messages = [];
      const accepted = [];
      for (const file of Array.from(fileList)) {
        const problem = checkContractFile(file);
        if (problem) messages.push(problem);
        else accepted.push(file);
      }
      setNotice(messages.length > 0 ? messages.join(' ') : null);
      for (const file of accepted) {
        const mimeType = resolveContractFileMimeType(file);
        const previewUrl = isContractPhoto(mimeType) ? URL.createObjectURL(file) : null;
        if (previewUrl) createdUrls.current.add(previewUrl);
        const key = newKey();
        setItems((prev) => [...prev, { key, fileName: file.name, mimeType, status: 'uploading', progress: 0, error: null }]);
        upload(key, file, mimeType, previewUrl);
      }
    },
    [upload],
  );

  const dismiss = useCallback((key) => setItems((prev) => prev.filter((item) => item.key !== key)), []);

  return {
    items,
    uploaded,
    previewUrls,
    notice,
    addFiles,
    dismiss,
    isUploading: items.some((item) => item.status === 'uploading'),
  };
};

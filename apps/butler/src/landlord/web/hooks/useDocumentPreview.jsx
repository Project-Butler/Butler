import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { postDocumentDownloadUrl } from '@butler/api-client';
import { isUnauthorizedError } from '../../../shared/apiError';
import { useDocumentUrls } from '../../../shared/documentViewer/useDocumentUrls';
import { DocumentPreviewModal, isPreviewableDocument } from '../components/DocumentPreviewModal/DocumentPreviewModal';

// PC 웹에서 붙은 파일을 새 탭 대신 공용 미리보기 팝업(DocumentPreviewModal)으로 연다.
//   - 사진·동영상·PDF 모두 같은 흰 팝업. 팝업으로 못 그리는 형식(HEIC 등)만 새 탭으로 연다.
//   - openPreview(document, documents?): documents를 주면 그 목록 안에서 이전·다음으로 넘겨 본다(예: 기록의 사진들).
// 반환: { openPreview, preview } — preview(팝업 요소)를 화면 어딘가에 그린다.
//   팝업은 body에 그려서(portal) 붙은 자리(고정 패널·다른 팝업)의 겹침 순서에 묶이지 않게 한다.
export const useDocumentPreview = ({ onUnauthorized } = {}) => {
  const fetchUrl = useCallback(
    async (documentId, options) => {
      try {
        return await postDocumentDownloadUrl(documentId, options);
      } catch (error) {
        if (isUnauthorizedError(error)) onUnauthorized?.();
        throw error;
      }
    },
    [onUnauthorized],
  );
  const urls = useDocumentUrls(fetchUrl);
  const [previewing, setPreviewing] = useState(null);

  const openPreview = useCallback(
    (document, documents) => {
      if (!isPreviewableDocument(document)) {
        urls.open(document);
        return;
      }
      const list = documents?.length ? documents : [document];
      setPreviewing({ documents: list, startIndex: Math.max(0, list.findIndex((item) => item.id === document.id)) });
    },
    [urls],
  );

  const preview = useMemo(
    () =>
      previewing
        ? createPortal(
            <DocumentPreviewModal
              documents={previewing.documents}
              startIndex={previewing.startIndex}
              urls={urls}
              onClose={() => setPreviewing(null)}
            />,
            document.body,
          )
        : null,
    [previewing, urls],
  );

  return { openPreview, preview };
};

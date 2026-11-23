import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { postDocumentDownloadUrl } from '@butler/api-client';
import { isUnauthorizedError } from '../../../shared/apiError';
import { useDocumentUrls } from '../../../shared/documentViewer/useDocumentUrls';
import { DocumentPreviewModal, isPreviewableDocument } from '../components/DocumentPreviewModal/DocumentPreviewModal';

// PC 웹에서 붙은 파일을 새 탭 대신 팝업으로 연다(문서함과 같은 DocumentPreviewModal).
//   - 사진·동영상: 공용 뷰어(확대·재생·저장), PDF: 팝업 안 브라우저 PDF 뷰어
//   - 팝업으로 못 그리는 형식(HEIC 등)만 새 탭으로 연다.
// 반환: { openPreview(document), preview } — preview(팝업 요소)를 화면 어딘가에 그린다.
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
    (document) => (isPreviewableDocument(document) ? setPreviewing(document) : urls.open(document)),
    [urls],
  );

  const preview = useMemo(
    () =>
      previewing
        ? createPortal(<DocumentPreviewModal document={previewing} urls={urls} onClose={() => setPreviewing(null)} />, document.body)
        : null,
    [previewing, urls],
  );

  return { openPreview, preview };
};

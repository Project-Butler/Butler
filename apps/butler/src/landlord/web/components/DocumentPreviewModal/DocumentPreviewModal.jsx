import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@butler/ui';
import { Modal } from '../Modal/Modal';
import { DocumentViewer } from '../../../../shared/documentViewer/DocumentViewer';
import { isImageDocument, isPdfDocument } from '../../../../shared/documentViewer/documentFiles';
import { formatFileSize } from '../../utils/attachment';

// 팝업으로 미리 볼 수 있는 파일: 브라우저가 그리는 사진(JPG·PNG·WEBP·GIF)과 PDF. HEIC 등은 새 탭으로 연다.
export const isPreviewableDocument = (document) => isImageDocument(document) || isPdfDocument(document);

// 문서함 미리보기 팝업.
//   - 열 때 그 문서 하나의 새 주소를 받는다(감사 1줄 = 연 횟수). 옆 파일·썸네일 주소는 미리 받지 않는다.
//   - 사진: 공용 DocumentViewer(확대·끌기·저장)에 이 문서 하나만 넘긴다.
//   - PDF: 브라우저 내장 PDF 뷰어(iframe)로 보여 준다. 저장소 응답이 Content-Disposition: inline이라 팝업 안에 그려진다.
// urls: useDocumentUrls 결과(load·open·save·entries).
export const DocumentPreviewModal = ({ document, urls, onClose }) => {
  const [preview, setPreview] = useState({ status: 'loading', url: null });
  const { load } = urls;

  useEffect(() => {
    let isActive = true;
    // force: 4분 안에 다시 열어도 새 주소를 받는다(열 때마다 감사). 같은 순간 두 번 불려도 진행 중인 요청을 같이 쓴다.
    load(document.id, { force: true }).then((url) => {
      if (isActive) setPreview(url ? { status: 'ready', url } : { status: 'error', url: null });
    });
    return () => {
      isActive = false;
    };
  }, [document.id, load]);

  if (isImageDocument(document) && preview.status === 'ready') {
    return <DocumentViewer documents={[document]} urls={urls} onClose={onClose} />;
  }

  const openInTab = () => {
    // 받은 주소가 있으면 그대로 쓰고(새 감사 없음), 실패했으면 새로 받아 연다.
    if (preview.url) window.open(preview.url, '_blank', 'noopener,noreferrer');
    else urls.open(document);
  };

  return (
    <Modal
      title={document.fileName}
      subtitle={formatFileSize(document.sizeBytes)}
      icon={FileText}
      iconTone="mute"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="h44" onClick={() => urls.save(document)} disabled={preview.status === 'loading'}>
            <Download size={16} className="-ml-0.5 mr-1.5 inline-block align-[-3px]" aria-hidden="true" />
            저장
          </Button>
          <Button variant="secondary" size="h44" onClick={openInTab}>
            <ExternalLink size={16} className="-ml-0.5 mr-1.5 inline-block align-[-3px]" aria-hidden="true" />
            새 탭에서 열기
          </Button>
        </>
      }
    >
      {preview.status === 'loading' && <p className="py-16 text-center text-body text-ink-3">불러오는 중입니다</p>}
      {preview.status === 'error' && <p className="py-16 text-center text-body text-ink-3">파일을 열지 못했어요</p>}
      {preview.status === 'ready' && (
        <iframe title={`${document.fileName} 미리보기`} src={preview.url} className="h-[70vh] w-full rounded-input border border-line bg-surface-2" />
      )}
    </Modal>
  );
};

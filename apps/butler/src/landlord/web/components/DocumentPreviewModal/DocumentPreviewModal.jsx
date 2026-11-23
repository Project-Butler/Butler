import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, FileVideo, Image as ImageIcon } from 'lucide-react';
import { Button } from '@butler/ui';
import { Modal } from '../Modal/Modal';
import { isImageDocument, isPdfDocument, isVideoDocument, VIDEO_URL_FRESH_MS } from '../../../../shared/documentViewer/documentFiles';
import { formatFileSize } from '../../utils/attachment';

// 팝업으로 미리 볼 수 있는 파일: 브라우저가 그리는 사진(JPG·PNG·WEBP·GIF), 동영상(MP4·MOV), PDF. HEIC 등은 새 탭으로 연다.
export const isPreviewableDocument = (document) => isImageDocument(document) || isVideoDocument(document) || isPdfDocument(document);

const ICONS = { image: ImageIcon, video: FileVideo, pdf: FileText };
const kindOf = (document) => (isImageDocument(document) ? 'image' : isVideoDocument(document) ? 'video' : 'pdf');

const NAV_BUTTON =
  'absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30';

// PC 웹 공용 미리보기 팝업(문서함·하우스 로그·첨부 칸). 사진·동영상·PDF를 같은 흰 팝업에 보여 준다.
//   - document: 한 파일만, documents + startIndex: 여러 파일을 이전·다음(←·→)으로 넘긴다(팝업으로 볼 수 있는 파일만 넘긴다).
//   - 사진: 화면에 맞춰 보여 주고, 누르면 원래 크기(스크롤로 보기) ↔ 맞춤을 바꾼다.
//   - 동영상: 브라우저 기본 컨트롤로 재생. PDF: 브라우저 내장 PDF 뷰어(저장소 응답이 inline이라 팝업 안에 그려진다).
//   - 열 때(넘길 때) 그 파일 하나의 새 주소를 받는다(감사 1줄 = 연 횟수). 옆 파일 주소는 미리 받지 않는다.
//   - Esc는 이 팝업만 닫는다(다른 팝업 위에서 열려도 뒤 팝업까지 닫히지 않게 window 캡처 단계에서 먼저 받는다).
// urls: useDocumentUrls 결과(load·open·save).
export const DocumentPreviewModal = ({ document, documents, startIndex = 0, urls, onClose }) => {
  const list = documents?.length ? documents.filter(isPreviewableDocument) : [document];
  const [index, setIndex] = useState(() => {
    const start = documents?.length ? list.findIndex((item) => item.id === documents[startIndex]?.id) : 0;
    return Math.max(0, start);
  });
  const current = list[Math.min(index, list.length - 1)];
  const total = list.length;
  const kind = kindOf(current);
  const [preview, setPreview] = useState({ id: null, status: 'loading', url: null });
  const [isActualSize, setIsActualSize] = useState(false);
  const { load } = urls;

  const goTo = useCallback((next) => {
    setIndex((prev) => Math.min(total - 1, Math.max(0, typeof next === 'function' ? next(prev) : next)));
    setIsActualSize(false);
  }, [total]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onCloseRef.current();
      } else if (event.key === 'ArrowLeft' && total > 1) {
        goTo((prev) => prev - 1);
      } else if (event.key === 'ArrowRight' && total > 1) {
        goTo((prev) => prev + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [goTo, total]);

  useEffect(() => {
    let isActive = true;
    setPreview({ id: current.id, status: 'loading', url: null });
    // force: 다시 열어도 새 주소를 받는다(열 때마다 감사). 동영상 주소는 60분 유효.
    load(current.id, { force: true, freshMs: isVideoDocument(current) ? VIDEO_URL_FRESH_MS : undefined }).then((url) => {
      if (isActive) setPreview({ id: current.id, status: url ? 'ready' : 'error', url });
    });
    return () => {
      isActive = false;
    };
  }, [current, load]);

  const ready = preview.id === current.id && preview.status === 'ready';
  const failed = preview.id === current.id && preview.status === 'error';

  const openInTab = () => {
    // 받은 주소가 있으면 그대로 쓰고(새 감사 없음), 실패했으면 새로 받아 연다.
    if (ready) window.open(preview.url, '_blank', 'noopener,noreferrer');
    else urls.open(current);
  };

  const subtitle = [total > 1 ? `${index + 1} / ${total}` : null, formatFileSize(current.sizeBytes)].filter(Boolean).join(' · ');

  return (
    <Modal
      title={current.fileName}
      subtitle={subtitle}
      icon={ICONS[kind]}
      iconTone="mute"
      size="xl"
      onClose={onClose}
      footer={
        <>
          {kind === 'image' && ready && (
            <Button variant="secondary" size="h44" onClick={() => setIsActualSize((prev) => !prev)}>
              {isActualSize ? '화면에 맞추기' : '원래 크기'}
            </Button>
          )}
          <Button variant="secondary" size="h44" onClick={() => urls.save(current)} disabled={!ready && !failed}>
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
      <div className="relative">
        {total > 1 && (
          <>
            <button type="button" aria-label="이전 파일" onClick={() => goTo(index - 1)} disabled={index === 0} className={`${NAV_BUTTON} left-2`}>
              <ChevronLeft size={22} />
            </button>
            <button type="button" aria-label="다음 파일" onClick={() => goTo(index + 1)} disabled={index === total - 1} className={`${NAV_BUTTON} right-2`}>
              <ChevronRight size={22} />
            </button>
          </>
        )}
        <div className="flex h-[70vh] items-center justify-center overflow-hidden rounded-input border border-line bg-surface-2">
          {!ready && !failed && <p className="text-body text-ink-3">불러오는 중입니다</p>}
          {failed && <p className="text-body text-ink-3">파일을 열지 못했어요</p>}
          {ready && kind === 'image' &&
            (isActualSize ? (
              <div className="h-full w-full overflow-auto">
                <button type="button" onClick={() => setIsActualSize(false)} className="block cursor-zoom-out" aria-label="화면에 맞추기">
                  <img src={preview.url} alt={current.fileName} className="max-w-none" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setIsActualSize(true)} className="flex h-full w-full cursor-zoom-in items-center justify-center p-3" aria-label="원래 크기로 보기">
                <img src={preview.url} alt={current.fileName} className="max-h-full max-w-full object-contain" />
              </button>
            ))}
          {ready && kind === 'video' && (
            <video key={current.id} src={preview.url} controls playsInline preload="metadata" className="max-h-full max-w-full bg-ink">
              동영상을 재생할 수 없어요. [저장]으로 내려받아 보세요.
            </video>
          )}
          {ready && kind === 'pdf' && (
            <iframe key={current.id} title={`${current.fileName} 미리보기`} src={preview.url} className="h-full w-full bg-surface" />
          )}
        </div>
      </div>
    </Modal>
  );
};

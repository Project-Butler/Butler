import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, FileText, X } from 'lucide-react';
import { postDocumentDownloadUrl } from '@butler/api-client';
import { isUnauthorizedError } from '../../../../shared/apiError';
import { isContractPhoto } from '../../utils/tenantInvite';

// A2b 크게 보기: 어두운 전체 덮개 위에 파일 이름 · n / 전체 · 이전·다음 · 아래 썸네일 줄.
// 미리보기만 하고 자동 보정(반듯하게 펴기·글자 판독)은 하지 않는다(결정 10). PDF는 새 창에서 연다.
// Esc는 이 덮개만 닫는다(뒤의 초대 팝업까지 닫히지 않게 window 캡처 단계에서 먼저 받는다).
export const SharedDocumentPreview = ({ documents, initialIndex = 0, imageUrls, onClose, onUnauthorized }) => {
  const [index, setIndex] = useState(Math.min(initialIndex, documents.length - 1));
  const panelRef = useRef(null);
  const total = documents.length;
  const current = documents[index];
  const canPrev = index > 0;
  const canNext = index < total - 1;

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    panelRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === 'ArrowLeft') {
        setIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === 'ArrowRight') {
        setIndex((prev) => Math.min(prev + 1, total - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [total]);

  // 응답을 기다린 뒤 창을 열면 팝업 차단에 걸려서 빈 창을 먼저 열고 주소를 넣는다(DocumentThumbnail과 같다).
  const openOriginal = async () => {
    const opened = window.open('', '_blank');
    if (opened) opened.opener = null;
    try {
      const issued = await postDocumentDownloadUrl(current.id);
      if (opened) opened.location.href = issued.url;
      else window.open(issued.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      opened?.close();
      if (isUnauthorizedError(error)) onUnauthorized?.();
    }
  };

  if (!current) return null;
  const isPhoto = isContractPhoto(current.mimeType);
  const imageUrl = imageUrls[current.id];

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${current.fileName} 크게 보기`}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-ink/90 px-6 py-5 text-white outline-none"
    >
      <div className="flex items-center gap-4">
        <p className="min-w-0 flex-1 truncate text-body font-semibold">{current.fileName}</p>
        <p className="font-num text-body tabular-nums" aria-live="polite">
          {index + 1} / {total}
        </p>
        <button
          type="button"
          aria-label="크게 보기 닫기"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-input text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative mt-4 flex min-h-0 flex-1 items-center justify-center">
        <button
          type="button"
          aria-label="이전 파일"
          onClick={() => setIndex((prev) => prev - 1)}
          disabled={!canPrev}
          className="absolute left-0 flex h-12 w-12 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
        >
          <ChevronLeft size={28} />
        </button>
        {isPhoto ? (
          imageUrl ? (
            <img src={imageUrl} alt={current.fileName} className="max-h-full max-w-[calc(100%-8rem)] rounded-input bg-white object-contain" />
          ) : (
            <p className="text-body text-white/70">불러오는 중</p>
          )
        ) : (
          <div className="flex w-72 flex-col items-center gap-3 rounded-card bg-surface p-8 text-center text-ink">
            <span className="flex h-14 w-14 items-center justify-center rounded-btn bg-crit-soft text-crit-ink" aria-hidden="true">
              <FileText size={28} strokeWidth={1.8} />
            </span>
            <p className="w-full truncate text-body font-semibold">{current.fileName}</p>
            <button
              type="button"
              onClick={openOriginal}
              className="inline-flex h-11 items-center gap-1.5 rounded-btn border border-line px-4 text-btn font-semibold text-ink transition-colors hover:bg-surface-2"
            >
              <ExternalLink size={16} aria-hidden="true" />
              새 창에서 열기
            </button>
          </div>
        )}
        <button
          type="button"
          aria-label="다음 파일"
          onClick={() => setIndex((prev) => prev + 1)}
          disabled={!canNext}
          className="absolute right-0 flex h-12 w-12 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
        >
          <ChevronRight size={28} />
        </button>
      </div>

      <ol className="mt-4 flex justify-center gap-2 overflow-x-auto" aria-label="파일 목록">
        {documents.map((document, position) => {
          const thumbUrl = imageUrls[document.id];
          const isCurrent = position === index;
          return (
            <li key={document.id}>
              <button
                type="button"
                aria-label={`${position + 1}번째 파일 ${document.fileName}`}
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => setIndex(position)}
                className={`flex h-16 w-12 items-center justify-center overflow-hidden rounded-input bg-surface-2 ${
                  isCurrent ? 'border-2 border-white' : 'border border-white/30 opacity-70 hover:opacity-100'
                }`}
              >
                {isContractPhoto(document.mimeType) ? (
                  thumbUrl && <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-num text-chip font-bold text-crit-ink">PDF</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex items-center justify-between text-sub text-white/80">
        <span>글자가 흐리면 다시 찍어 올려 주세요</span>
        <span>선택한 파일을 차례로 넘겨 봐요</span>
      </div>
    </div>
  );
};

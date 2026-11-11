import { useEffect, useMemo, useState } from 'react';
import { DocumentViewer } from './DocumentViewer';
import { formatBytes, getFileBadge, splitDocuments } from './documentFiles';
import { useDocumentUrls } from './useDocumentUrls';

const PhotoTile = ({ document, number, entry, onOpen, onError, height }) => (
  <button
    type="button"
    aria-label={`사진 ${number} 크게 보기`}
    onClick={onOpen}
    className={`relative overflow-hidden rounded-input border border-line bg-surface-2 ${height}`}
  >
    {entry?.url && entry.status !== 'error' && (
      <img src={entry.url} alt="" draggable={false} onError={onError} className="h-full w-full object-cover" loading="lazy" />
    )}
    <span className="absolute bottom-1 right-1 rounded bg-ink/70 px-1 font-num text-[10px] tabular-nums text-white">{number}</span>
    <span className="sr-only">{document.fileName}</span>
  </button>
);

// 공유된 계약서(시안 B3 · E2): PDF 등 파일은 줄로 [열기], 사진은 3칸 격자 → 누르면 전체 화면 뷰어(B4).
// 보기만 한다(올리기 없음, 결정 4). fetchUrl(documentId) 는 화면마다 다르다(초대 확인 세션 주소 · 로그인 문서 주소).
// variant: 'inline'(B3, 카드 하나 안에) | 'cards'(E2, 파일·사진 칸을 각각 카드로)
export const SharedDocuments = ({ documents, fetchUrl, variant = 'inline', title }) => {
  const urls = useDocumentUrls(fetchUrl);
  const { files, photos, ordered } = useMemo(() => splitDocuments(documents), [documents]);
  const [viewerIndex, setViewerIndex] = useState(null);
  const [openError, setOpenError] = useState('');
  const { load } = urls;

  // 격자 썸네일 주소. 뷰어를 열면 그때 다시 새 주소를 확인한다.
  useEffect(() => {
    photos.forEach((photo) => load(photo.id));
  }, [photos, load]);

  const openFile = async (document) => {
    setOpenError('');
    const ok = await urls.open(document);
    if (!ok) setOpenError('파일을 열지 못했어요. 잠시 후 다시 시도해 주세요.');
  };

  const isCards = variant === 'cards';
  const fileRows = files.map((document) => (
    <li key={document.id} className={isCards ? 'flex items-center gap-3 rounded-card border border-line bg-surface p-3' : 'flex items-center gap-3'}>
      <span
        className={`flex shrink-0 items-center justify-center rounded border border-line bg-crit-box font-num text-[10px] font-bold text-crit-ink ${isCards ? 'h-10 w-8' : 'h-14 w-11'}`}
      >
        {getFileBadge(document)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-semibold text-ink ${isCards ? 'text-body' : 'text-m-sub'}`}>{document.fileName}</span>
        <span className="font-num text-m-sub tabular-nums text-ink-3">{formatBytes(document.sizeBytes)}</span>
      </span>
      <button
        type="button"
        onClick={() => openFile(document)}
        aria-label={`${document.fileName} 열기`}
        className={isCards ? 'h-9 rounded-btn border border-line bg-surface px-3 text-btn-sm font-semibold text-ink hover:bg-surface-2' : 'px-1 text-m-sub font-semibold text-accent'}
      >
        열기
      </button>
    </li>
  ));

  const photoGrid = photos.length > 0 && (
    <div className={isCards ? 'rounded-card border border-line bg-surface p-3' : files.length > 0 ? 'border-t border-line pt-3' : ''}>
      <p className="mb-2 text-m-sub text-ink-3">
        사진 <span className="font-num tabular-nums">{photos.length}</span>장 · 누르면 크게 봐요
      </p>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, position) => (
          <PhotoTile
            key={photo.id}
            document={photo}
            number={position + 1}
            entry={urls.entries[photo.id]}
            height={isCards ? 'h-16' : 'h-[72px]'}
            onOpen={() => setViewerIndex(files.length + position)}
            onError={() => urls.reportError(photo.id)}
          />
        ))}
      </div>
    </div>
  );

  return (
    <>
      {isCards ? (
        <section aria-label={title} className="space-y-3">
          <p className="text-m-sub font-semibold text-ink-2">{title}</p>
          {ordered.length === 0 && <p className="rounded-card border border-line bg-surface p-4 text-body text-ink-3">공유받은 계약서가 없어요.</p>}
          {files.length > 0 && <ul className="space-y-3">{fileRows}</ul>}
          {photoGrid}
        </section>
      ) : (
        <section aria-label={title} className="space-y-3 rounded-card border border-line bg-surface p-3">
          <p className="text-m-sub font-semibold text-ink-2">
            {title} <span className="font-num tabular-nums">{ordered.length}</span>
          </p>
          {ordered.length === 0 && <p className="text-m-sub text-ink-3">함께 공유된 파일이 없어요.</p>}
          {files.length > 0 && <ul className="space-y-3">{fileRows}</ul>}
          {photoGrid}
        </section>
      )}
      {openError && (
        <p role="alert" className="text-m-sub text-crit-ink">
          {openError}
        </p>
      )}
      {viewerIndex !== null && <DocumentViewer documents={ordered} startIndex={viewerIndex} urls={urls} onClose={() => setViewerIndex(null)} />}
    </>
  );
};

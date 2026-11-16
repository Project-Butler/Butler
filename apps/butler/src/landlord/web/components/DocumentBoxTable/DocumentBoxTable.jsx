import { useEffect, useRef, useState } from 'react';
import { FileText, Image, MoreHorizontal } from 'lucide-react';
import { Badge, Button } from '@butler/ui';
import { IconTile } from '../IconTile/IconTile';
import { formatFileSize } from '../../utils/attachment';
import { canDeleteDocument, getDocumentTypeLabel, isSharedLockedDocument } from '../../utils/documentBox';
import { formatDateKST } from '../../utils/format';

const isImage = (doc) => doc.mimeType?.startsWith('image/');

// 더 보기 메뉴: 이름 보기 · 삭제(올린 본인만, 조건은 documentBox.canDeleteDocument). 그림자 없이 border-line + bg-surface로 면을 나눈다.
const RowMenu = ({ doc, canDelete, isSharedLocked, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState('menu');
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggle = () => {
    setView('menu');
    setIsOpen((prev) => !prev);
  };

  const itemClass = 'flex min-h-11 w-full items-center rounded-input px-3 text-left text-body text-ink transition-colors hover:bg-surface-2';

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-label={`${doc.fileName} 더 보기`}
        aria-expanded={isOpen}
        onClick={toggle}
        className="flex h-11 w-11 items-center justify-center rounded-input text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <MoreHorizontal size={18} />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-input border border-line bg-surface p-1">
          {view === 'menu' ? (
            <>
              <button type="button" className={itemClass} onClick={() => setView('info')}>
                이름 보기
              </button>
              {canDelete && (
                <button
                  type="button"
                  className={`${itemClass} text-crit-ink`}
                  onClick={() => {
                    setIsOpen(false);
                    onDelete(doc);
                  }}
                >
                  삭제
                </button>
              )}
              {isSharedLocked && <p className="px-3 py-2.5 text-sub text-ink-3">임차인에게 공유한 서류라 지울 수 없어요</p>}
            </>
          ) : (
            <dl className="space-y-2 px-3 py-2.5 text-body">
              <div>
                <dt className="text-sub text-ink-3">이름</dt>
                <dd className="break-all text-ink">{doc.fileName}</dd>
              </div>
              <div className="flex gap-4">
                <div>
                  <dt className="text-sub text-ink-3">크기</dt>
                  <dd className="font-num tabular-nums text-ink">{formatFileSize(doc.sizeBytes)}</dd>
                </div>
                <div>
                  <dt className="text-sub text-ink-3">올린 날</dt>
                  <dd className="font-num tabular-nums text-ink">{formatDateKST(doc.createdAt)}</dd>
                </div>
              </div>
            </dl>
          )}
        </div>
      )}
    </div>
  );
};

// 서류 표(design.md 표 규칙): 파일(형식 아이콘 + 이름 말줄임) · 종류 칩 · 올린 날 · 크기 · [열기] · 더 보기.
// contract: 계약 서류 표면 그 계약(삭제 조건 판단용), 내 소유 서류 표면 생략. urlEntries: useDocumentUrls의 entries(열기 상태).
export const DocumentBoxTable = ({ documents, contract, userId, urlEntries, onOpen, onDelete, showHead = false }) => (
  <table className="w-full text-body">
    {showHead && (
      <thead>
        <tr className="border-b border-line bg-surface-2 text-sub font-semibold text-ink-2">
          <th className="px-5 py-3 text-left font-semibold">파일</th>
          <th className="px-5 py-3 text-left font-semibold">종류</th>
          <th className="px-5 py-3 text-left font-semibold">올린 날</th>
          <th className="px-5 py-3 text-right font-semibold">크기</th>
          <th className="px-5 py-3">
            <span className="sr-only">열기·더 보기</span>
          </th>
        </tr>
      </thead>
    )}
    <tbody>
      {documents.map((doc) => {
        const status = urlEntries[doc.id]?.status;
        return (
          <tr key={doc.id} className="border-b border-line transition-colors last:border-b-0 hover:bg-surface-2">
            <td className="w-full max-w-0 px-5 py-4">
              <span className="flex items-center gap-2.5">
                <IconTile icon={isImage(doc) ? Image : FileText} tone="mute" size="sm" />
                <span className="min-w-0 truncate font-semibold text-ink" title={doc.fileName}>
                  {doc.fileName}
                </span>
              </span>
            </td>
            <td className="whitespace-nowrap px-5 py-4">
              <Badge tone="default">{getDocumentTypeLabel(doc.documentType)}</Badge>
            </td>
            <td className="whitespace-nowrap px-5 py-4 font-num text-sub tabular-nums text-ink-3">{formatDateKST(doc.createdAt)}</td>
            <td className="whitespace-nowrap px-5 py-4 text-right font-num text-sub tabular-nums text-ink-3">{formatFileSize(doc.sizeBytes)}</td>
            <td className="whitespace-nowrap px-5 py-2 text-right">
              {status === 'error' && <span className="mr-2 text-sub text-ink-3">파일을 열지 못했어요</span>}
              <Button variant="secondary" size="sm" onClick={() => onOpen(doc)} disabled={status === 'loading'}>
                {status === 'loading' ? '여는 중' : '열기'}
              </Button>
              <RowMenu
                doc={doc}
                canDelete={canDeleteDocument(doc, { userId, contract })}
                isSharedLocked={isSharedLockedDocument(doc, { userId, contract })}
                onDelete={onDelete}
              />
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

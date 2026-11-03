import { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { postDocumentDownloadUrl } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../utils/apiError';
import { isRenderableImage } from '../../utils/attachment';

// 붙은 문서 한 건의 썸네일. 열 때 다운로드 URL(5분 유효)을 받고, 사진이 안 뜨면(만료 등) 한 번만 다시 받는다.
// 브라우저가 못 그리는 형식(HEIC·PDF)은 썸네일 대신 다운로드 링크를 보여 준다.
export const DocumentThumbnail = ({ document, onUnauthorized, className = '' }) => {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const [hasRetried, setHasRetried] = useState(false);
  const renderable = isRenderableImage(document.mimeType);

  const load = useCallback(async () => {
    try {
      const issued = await postDocumentDownloadUrl(document.id);
      setUrl(issued.url);
      setError(null);
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onUnauthorized?.();
        return;
      }
      const apiError = toApiError(requestError);
      setError(apiError.code === 'STORAGE_UNAVAILABLE' ? '사진 보기 준비 중' : apiError.message);
    }
  }, [document.id, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  const handleImageError = () => {
    if (hasRetried) {
      setError('사진을 불러오지 못했어요');
      return;
    }
    setHasRetried(true);
    load();
  };

  const frame = `flex aspect-square items-center justify-center overflow-hidden rounded-input border border-line bg-surface-2 ${className}`;

  if (error) {
    return (
      <div className={frame}>
        <p className="px-2 text-center text-chip text-ink-3">{error}</p>
      </div>
    );
  }
  if (!url) {
    return (
      <div className={frame}>
        <p className="text-chip text-ink-3">불러오는 중</p>
      </div>
    );
  }
  if (renderable) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={`${frame} hover:opacity-90`} title={`${document.fileName} 원본 보기`}>
        <img src={url} alt={document.fileName} onError={handleImageError} className="h-full w-full object-cover" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`${frame} flex-col gap-1.5 px-2 hover:bg-surface`} title={document.fileName}>
      <FileText size={24} className="text-ink-3" />
      <span className="w-full truncate text-center text-chip text-ink-2">{document.fileName}</span>
      <span className="text-chip font-semibold text-accent-strong">다운로드</span>
    </a>
  );
};

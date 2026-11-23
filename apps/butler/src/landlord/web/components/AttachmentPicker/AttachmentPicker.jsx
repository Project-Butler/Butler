import { useRef } from 'react';
import { FileText, FileVideo, ImagePlus, Lock, X } from 'lucide-react';
import { Button } from '@butler/ui';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { DocumentThumbnail } from '../DocumentThumbnail/DocumentThumbnail';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import {
  buildAttachmentAccept,
  DEFAULT_FILE_KINDS,
  DEFAULT_UPLOAD_RULES,
  describeAttachmentLimits,
  formatFileSize,
  isVideoMimeType,
  MAX_LOG_ATTACHMENTS,
} from '../../utils/attachment';

const UploadingPreview = ({ item }) => (
  <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-input border border-line bg-surface-2">
    {item.previewUrl ? (
      <img src={item.previewUrl} alt={item.fileName} className="h-full w-full object-cover" />
    ) : (
      <span className="flex flex-col items-center gap-1.5 px-2">
        {isVideoMimeType(item.mimeType) ? <FileVideo size={24} className="text-ink-3" /> : <FileText size={24} className="text-ink-3" />}
        <span className="w-full truncate text-center text-chip text-ink-2">{item.fileName}</span>
      </span>
    )}
    {item.status === 'uploading' && (
      <span className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <span
          role="progressbar"
          aria-label={`${item.fileName} 올리는 중`}
          aria-valuenow={Math.round(item.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="block h-full bg-accent transition-all"
          style={{ width: `${Math.round(item.progress * 100)}%` }}
        />
      </span>
    )}
  </div>
);

// 관리 로그 사진 첨부(작성·수정 공통). uploads는 useAttachmentUploads()의 반환값.
// 형식·크기는 고를 때 미리 검사하고, 업로드 진행·미리보기·빼기를 보여 준다.
// label: 칸 이름(기본 '사진 (선택)', 동영상을 받는 곳은 '사진·동영상 (선택)'). 갱신 거절 통지 증빙처럼 PDF 도 받는 곳은 다른 이름을 준다.
// previewInPopup: 올라간 파일을 누르면 새 탭 대신 미리보기 팝업으로 연다(PC 웹). 앱 화면은 지금처럼 새 탭.
export const AttachmentPicker = ({ uploads, label, disabled = false, onUnauthorized, previewInPopup = false }) => {
  const inputRef = useRef(null);
  const { openPreview, preview } = useDocumentPreview({ onUnauthorized });
  const { items, addFiles, remove, notice, storageUnavailable } = uploads;
  // 올라간 파일들만 이전·다음으로 넘겨 본다(올리는 중인 파일은 아직 서버 문서가 아니다).
  const uploadedDocuments = items
    .filter((item) => item.status === 'done' && item.documentId)
    .map((item) => ({ id: item.documentId, fileName: item.fileName, mimeType: item.mimeType, sizeBytes: item.sizeBytes }));
  const maxCount = uploads.maxCount ?? MAX_LOG_ATTACHMENTS;
  const isFull = items.length >= maxCount;
  // 받는 형식은 useAttachmentUploads(resourceType)가 정한다. 동영상을 받는 곳(수리 요청)만 버튼·안내가 달라진다.
  const rules = uploads.rules ?? DEFAULT_UPLOAD_RULES;
  const kinds = uploads.kinds ?? DEFAULT_FILE_KINDS;
  const acceptsVideo = kinds.includes('VIDEO');
  const title = label ?? (acceptsVideo ? '사진·동영상 (선택)' : '사진 (선택)');

  const handleChange = (event) => {
    addFiles(event.target.files);
    // 같은 파일을 다시 고를 수 있게 비운다.
    event.target.value = '';
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label font-semibold text-ink">
          {title}{' '}
          <span className="font-num font-normal tabular-nums text-ink-3">
            {items.length}/{maxCount}
          </span>
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || storageUnavailable || isFull}
        >
          <ImagePlus size={14} className="-ml-0.5 mr-1 inline-block" />
          {acceptsVideo ? '사진·동영상 추가' : '사진 추가'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={buildAttachmentAccept(rules, kinds)}
          onChange={handleChange}
          className="hidden"
          aria-label="사진 파일 선택"
        />
      </div>
      <p className="text-chip text-ink-3">{describeAttachmentLimits(rules, kinds)}</p>
      {storageUnavailable && <NoticeBox tone="warn">사진 첨부 준비 중이에요. 글은 그대로 저장할 수 있어요.</NoticeBox>}
      {notice && <NoticeBox tone="warn">{notice}</NoticeBox>}

      {items.length > 0 && (
        <ul className="mt-1 grid grid-cols-4 gap-3">
          {items.map((item) => (
            <li key={item.key} className="space-y-1">
              <div className="relative">
                {item.status === 'done' && !item.previewUrl ? (
                  <DocumentThumbnail
                    document={{ id: item.documentId, fileName: item.fileName, mimeType: item.mimeType, sizeBytes: item.sizeBytes }}
                    onUnauthorized={onUnauthorized}
                    onOpen={previewInPopup ? (document) => openPreview(document, uploadedDocuments) : undefined}
                  />
                ) : (
                  <UploadingPreview item={item} />
                )}
                {item.isLocked ? (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-surface p-1 text-ink-3" title="넘어간 이력의 사진은 뺄 수 없어요">
                    <Lock size={12} />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => remove(item.key)}
                    disabled={disabled}
                    aria-label={`${item.fileName} 빼기`}
                    className="absolute right-1.5 top-1.5 rounded-full bg-surface p-1 text-ink-2 shadow-sm hover:text-ink disabled:opacity-50"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <p className="truncate text-chip text-ink-3" title={item.fileName}>
                {item.status === 'error' ? <span className="text-crit-ink">{item.error}</span> : formatFileSize(item.sizeBytes)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {preview}
    </div>
  );
};

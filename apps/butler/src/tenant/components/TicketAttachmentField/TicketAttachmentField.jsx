import { useRef } from 'react';
import { FileText, FileVideo, ImagePlus, X } from 'lucide-react';
import { buildAttachmentAccept, describeAttachmentLimits, isVideoMimeType } from '../../../shared/upload/attachment';

// 올린(또는 올리는 중인) 파일 한 칸. 사진은 고른 파일 미리보기, 동영상·PDF는 아이콘 + 글자(시안 v2.2 — 동영상 길이는 보이지 않음).
const AttachmentTile = ({ item, disabled, onRemove }) => {
  const isVideo = isVideoMimeType(item.mimeType);
  const Icon = isVideo ? FileVideo : FileText;
  return (
    <li className="relative">
      <div className="relative flex h-[72px] w-[72px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-input border border-line bg-surface-2 text-accent-strong">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt={item.fileName} className="h-full w-full object-cover" />
        ) : (
          <>
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span className="max-w-full truncate px-1 text-chip font-semibold">{isVideo ? '동영상' : item.mimeType === 'application/pdf' ? 'PDF' : '파일'}</span>
          </>
        )}
        {item.status === 'uploading' && (
          <span className="absolute inset-x-1.5 bottom-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
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
      <button
        type="button"
        onClick={() => onRemove(item.key)}
        disabled={disabled}
        aria-label={`${item.fileName} 빼기`}
        className="absolute right-1 top-1 rounded-full bg-surface p-0.5 text-ink-2 shadow-sm disabled:opacity-50"
      >
        <X size={14} aria-hidden="true" />
      </button>
      {item.status === 'error' && <p className="mt-1 w-[72px] text-chip text-crit-ink">{item.error}</p>}
    </li>
  );
};

// 수리 요청 사진·동영상 칸(시안 v2.2 ③). uploads 는 shared/upload/useAttachmentUploads(resourceType 'TICKET')의 반환값.
// 형식·크기 안내는 서버 업로드 규칙(GET /files/upload-rules) 값으로 만든다.
export const TicketAttachmentField = ({ uploads, disabled = false }) => {
  const inputRef = useRef(null);
  const { items, addFiles, remove, notice, storageUnavailable, maxCount, rules, kinds } = uploads;
  const isFull = items.length >= maxCount;
  const acceptsVideo = kinds.includes('VIDEO');

  const handleChange = (event) => {
    addFiles(event.target.files);
    // 같은 파일을 다시 고를 수 있게 비운다.
    event.target.value = '';
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-m-label font-semibold text-ink-2">
          {acceptsVideo ? '사진·동영상' : '사진'}{' '}
          <span className="font-normal text-ink-3">
            (선택){' '}
            <span className="font-num tabular-nums">
              {items.length}/{maxCount}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || storageUnavailable || isFull}
          className="flex h-9 items-center gap-1 rounded-btn border border-line bg-surface px-3 text-m-label font-semibold text-ink disabled:opacity-50"
        >
          <ImagePlus size={16} strokeWidth={1.8} aria-hidden="true" />
          추가
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={buildAttachmentAccept(rules, kinds)}
          onChange={handleChange}
          className="hidden"
          aria-label="사진·동영상 파일 선택"
        />
      </div>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <AttachmentTile key={item.key} item={item} disabled={disabled} onRemove={remove} />
          ))}
        </ul>
      )}
      <p className="text-m-sub text-ink-3">{describeAttachmentLimits(rules, kinds, { verb: '올릴' })}</p>
      {storageUnavailable && (
        <p role="status" className="text-m-sub text-warn-ink">
          사진 첨부 준비 중이에요. 글은 그대로 보낼 수 있어요.
        </p>
      )}
      {notice && (
        <p role="alert" className="text-m-sub text-warn-ink">
          {notice}
        </p>
      )}
    </div>
  );
};

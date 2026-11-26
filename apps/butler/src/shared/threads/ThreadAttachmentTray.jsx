import { FileText, FileVideo, X } from 'lucide-react';
import { isVideoMimeType } from '../upload/attachment';

// 입력칸 위 첨부 줄(시안 A3): 사진은 미리보기, PDF·동영상은 아이콘+이름. 올리는 중이면 아래 진행 막대, 실패면 붉은 테두리. [×]로 뺀다.
// uploads 는 useAttachmentUploads() 반환값(items·remove·maxCount).
export const ThreadAttachmentTray = ({ uploads, disabled = false }) => {
  const { items, remove, maxCount } = uploads;
  if (items.length === 0) return null;
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-0.5">
      <ul aria-label="보낼 첨부" className="flex gap-2">
        {items.map((item) => (
          <li
            key={item.key}
            className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-input border bg-surface-2 text-ink-3 ${
              item.status === 'error' ? 'border-crit' : 'border-line'
            }`}
            title={item.status === 'error' ? item.error : item.fileName}
          >
            {item.previewUrl ? (
              <img src={item.previewUrl} alt={item.fileName} className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-0.5 px-1">
                {isVideoMimeType(item.mimeType) ? <FileVideo size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}
                <span className="w-full truncate text-center text-[10px] text-ink-2">{item.fileName}</span>
              </span>
            )}
            {item.status === 'uploading' && (
              <span className="absolute inset-x-0 bottom-0 h-1 bg-accent/30">
                <span
                  role="progressbar"
                  aria-label={`${item.fileName} 올리는 중`}
                  aria-valuenow={Math.round(item.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="block h-1 bg-accent"
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </span>
            )}
            {item.status === 'error' && <span className="sr-only">{`${item.fileName} 올리지 못함: ${item.error}`}</span>}
            <button
              type="button"
              onClick={() => remove(item.key)}
              disabled={disabled}
              aria-label={`${item.fileName} 빼기`}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white disabled:opacity-50"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p className="shrink-0 self-end text-chip text-ink-3">
        <span className="font-num tabular-nums">{items.length}</span>/{maxCount}
      </p>
    </div>
  );
};

import { useRef } from 'react';
import { ImagePlus, Send } from 'lucide-react';
import { Button } from '@butler/ui';
import { NoticeBox } from '../NoticeBox';
import { buildAttachmentAccept } from '../upload/attachment';
import { ThreadAttachmentTray } from './ThreadAttachmentTray';
import { ATTACHMENT_UNAVAILABLE_TEXT, MAX_MESSAGE_LENGTH, MESSAGE_COUNTER_THRESHOLD } from './threadRules';

// 대화 입력칸(아래 고정 칸 안에 넣는다). composer 는 useThreadComposer() 반환값.
// 보내기 버튼은 type="submit" 이라 감싸는 form(MobileFormLayout onSubmit 등)이 composer.send 를 부른다.
// showAttach: [사진] 버튼과 첨부 줄을 켠다(첨부 보내기를 붙이는 화면만). 끄면 글 입력과 보내기만 — 지금 앱 대화 화면 그대로.
// showCounter: 100자 이하로 남았을 때 남은 글자 수를 보인다(끄면 지금 앱 대화 화면 그대로).
export const ThreadComposer = ({ composer, showAttach = false, showCounter = false, inputId = 'thread-message' }) => {
  const fileRef = useRef(null);
  const { draft, setDraft, readOnly, isSending, canSend, remaining, uploads } = composer;
  const isFull = uploads.items.length >= uploads.maxCount;

  const handleFiles = (event) => {
    uploads.addFiles(event.target.files);
    // 같은 파일을 다시 고를 수 있게 비운다.
    event.target.value = '';
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {showAttach && uploads.storageUnavailable && <NoticeBox tone="warn">{ATTACHMENT_UNAVAILABLE_TEXT}</NoticeBox>}
      {showAttach && uploads.notice && <NoticeBox tone="warn">{uploads.notice}</NoticeBox>}
      {showAttach && <ThreadAttachmentTray uploads={uploads} disabled={isSending} />}
      <div className="flex gap-2.5">
        {showAttach && !uploads.storageUnavailable && (
          <>
            <button
              type="button"
              aria-label="사진·파일 첨부"
              onClick={() => fileRef.current?.click()}
              disabled={readOnly || isSending || isFull}
              className="flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-btn border border-line bg-surface text-ink-2 disabled:opacity-50"
            >
              <ImagePlus size={20} aria-hidden="true" />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={buildAttachmentAccept(uploads.rules, uploads.kinds)}
              onChange={handleFiles}
              className="hidden"
              aria-label="첨부 파일 선택"
            />
          </>
        )}
        <label htmlFor={inputId} className="sr-only">
          메시지
        </label>
        <textarea
          id={inputId}
          rows={1}
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={readOnly || isSending}
          placeholder={readOnly ? '읽기 전용 대화예요' : '메시지 입력'}
          onChange={(event) => setDraft(event.target.value)}
          className="max-h-28 min-h-12 min-w-0 flex-1 resize-none rounded-input border border-line bg-surface px-3.5 py-3 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2"
        />
        <Button type="submit" size="h48" aria-label="보내기" disabled={!canSend} className="shrink-0">
          <Send size={18} aria-hidden="true" />
        </Button>
      </div>
      {showCounter && remaining <= MESSAGE_COUNTER_THRESHOLD && (
        <p aria-live="polite" className="text-right font-num text-chip tabular-nums text-ink-3">
          남은 글자 {remaining}
        </p>
      )}
    </div>
  );
};

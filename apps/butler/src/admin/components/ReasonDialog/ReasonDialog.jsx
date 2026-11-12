import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@butler/ui';

const MAX_REASON_LENGTH = 500;

// 사유를 받아 한 번 더 확인하는 대화상자(소유 관계 철회·종료). onSubmit(reason)은 { data, error }를 돌려주고,
// 성공하면 부모가 닫는다. 서버 오류(error)는 아래에 그대로 보여 준다. Esc·배경 클릭·취소로 닫힌다.
export const ReasonDialog = ({ title, description, confirmLabel, error, isLoading, onSubmit, onClose }) => {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(null);
  const titleId = useId();
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, onClose]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError('사유를 입력해 주세요.');
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isLoading) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-card bg-surface p-6 shadow-lg"
      >
        <div className="space-y-1">
          <h3 id={titleId} className="text-card font-semibold text-ink">
            {title}
          </h3>
          {description && <p className="text-body text-ink-2">{description}</p>}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold text-ink">사유</span>
          <textarea
            ref={textareaRef}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(null);
            }}
            maxLength={MAX_REASON_LENGTH}
            rows={3}
            aria-invalid={reasonError ? true : undefined}
            className={`resize-none rounded-input border bg-surface px-3.5 py-2.5 text-body text-ink outline-none placeholder:text-ink-3 ${
              reasonError ? 'border-crit' : 'border-line focus:border-accent'
            }`}
            placeholder="감사 로그에 남습니다."
          />
          <span className={`text-chip ${reasonError ? 'text-crit-ink' : 'text-ink-3'}`}>
            {reasonError ?? `${reason.length}/${MAX_REASON_LENGTH}`}
          </span>
        </label>

        {error && (
          <p role="alert" className="text-chip text-crit-ink">
            {error.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={isLoading}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
};

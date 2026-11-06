import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@butler/ui';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { usePostCommunityReport } from '../../hooks/usePostCommunityReport';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { REPORT_REASONS } from '../../utils/communityBoardLabels';
import { ChipGroup } from './ChipGroup';

const MAX_DETAIL_LENGTH = 500; // CommunityReport.detail VarChar(500)

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

// 글 신고 대화상자. 전용 디자인이 없어 새 모양을 만들지 않고 이미 있는 것을 조합했다:
// 창 틀은 AddressSearchDialog(어두운 덮개 + 가운데 카드 + 닫기, Esc · 바깥 클릭으로 닫기), 사유는 게시판 분류 칩,
// 상세는 BuildingEditPage 의 설명 칸, 버튼은 @butler/ui Button(취소 secondary · 신고하기 primary), 오류는 NoticeBox.
// 포커스 가둠: 열리면 창 안 첫 칸으로, Tab 이 창 밖으로 나가지 않고, 닫히면 열기 전 자리(신고 버튼)로 돌려준다.
export const ReportDialog = ({ postId, onDone, onClose }) => {
  const report = usePostCommunityReport();
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.querySelector(FOCUSABLE)?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusables = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const submit = async () => {
    try {
      await report.mutateAsync({ postId, reason, detail: detail.trim() || undefined });
      onDone();
    } catch {
      // 오류는 report.error 로 아래에 보여 준다(이미 신고한 글 409 포함).
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-report-title"
        className="flex w-full max-w-md flex-col gap-4 rounded-card bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="community-report-title" className="text-section font-semibold text-ink">
            신고
          </h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="-mr-3 flex h-11 w-11 items-center justify-center rounded-input text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-label font-semibold text-ink">사유</span>
          <ChipGroup label="신고 사유" options={REPORT_REASONS} value={reason} onChange={setReason} wrap />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="community-report-detail" className="text-label font-semibold text-ink">
            상세 내용 (선택)
          </label>
          <textarea
            id="community-report-detail"
            rows={3}
            maxLength={MAX_DETAIL_LENGTH}
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            className="rounded-input border border-line px-4 py-3 text-card text-ink outline-none focus:border-accent"
          />
        </div>

        {report.isError && <NoticeBox>{getErrorMessage(report.error)}</NoticeBox>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={!reason || report.isPending}>
            신고하기
          </Button>
        </div>
      </div>
    </div>
  );
};

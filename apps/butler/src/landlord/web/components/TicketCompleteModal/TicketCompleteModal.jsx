import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@butler/ui';
import { getRoomLabel } from '../../../../shared/room';
import { Modal } from '../Modal/Modal';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { buildTicketSummaryTitle, toCompleteBody } from '../../utils/ticketView';

const MAX_NOTE_LENGTH = 3000;
const FIELD_CLASS = 'w-full rounded-input border border-line bg-surface px-3.5 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2';

// PC [완료 처리] 팝업(시안 v2.2 ⑤, D5). 지금 API 그대로 처리 내용·비용을 받는다.
// - isVerified: 그 호실 소유 관계가 인증 상태인지(완료 요약이 호실 이력인지 나만 보기인지 안내).
// - extraFields: 본문 아래에 더할 칸(하우스 로그 3단계 U-11: 하우스 로그 제목·완료 사진·영수증). 지금은 쓰지 않는다.
// - onSubmit(payload): PATCH 바디({ status: 'DONE', resolutionNote?, cost? })를 받아 { data, error } 를 돌려준다.
export const TicketCompleteModal = ({ ticket, isVerified = false, extraFields = null, onSubmit, onClose }) => {
  const [form, setForm] = useState({ resolutionNote: '', cost: '' });
  const [state, setState] = useState({ isLoading: false, error: null });
  const roomLabel = getRoomLabel(ticket.room);
  const summaryTitle = buildTicketSummaryTitle(ticket);

  const handleSubmit = async () => {
    if (state.isLoading) return;
    setState({ isLoading: true, error: null });
    const { error } = await onSubmit(toCompleteBody(form));
    // 성공하면 쓰는 쪽이 닫는다. 401은 쓰는 쪽 hook 이 로그인으로 보낸다.
    setState({ isLoading: false, error: error ?? null });
  };

  const costDigits = form.cost.replace(/[^0-9]/g, '');
  const costText = costDigits ? Number(costDigits).toLocaleString('ko-KR') : '';

  return (
    <Modal
      title="완료 처리"
      subtitle={[ticket.title, ticket.property?.displayName, roomLabel].filter(Boolean).join(' · ')}
      icon={ClipboardCheck}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="h44" onClick={onClose} disabled={state.isLoading}>
            닫기
          </Button>
          <Button size="h44" onClick={handleSubmit} disabled={state.isLoading}>
            {state.isLoading ? '완료 처리 중' : '완료 처리'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ticket-complete-note" className="text-label font-semibold text-ink">
            처리 내용 <span className="font-normal text-ink-3">(선택)</span>
          </label>
          <textarea
            id="ticket-complete-note"
            value={form.resolutionNote}
            maxLength={MAX_NOTE_LENGTH}
            disabled={state.isLoading}
            placeholder="예) 싱크대 하부 배관 연결부 패킹 교체"
            onChange={(event) => setForm((prev) => ({ ...prev, resolutionNote: event.target.value }))}
            className={`${FIELD_CLASS} min-h-28 py-3`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ticket-complete-cost" className="text-label font-semibold text-ink">
            비용 <span className="font-normal text-ink-3">(선택)</span>
          </label>
          <div className="relative">
            <input
              id="ticket-complete-cost"
              inputMode="numeric"
              value={costText}
              disabled={state.isLoading}
              placeholder="0"
              onChange={(event) => setForm((prev) => ({ ...prev, cost: event.target.value }))}
              className={`${FIELD_CLASS} h-12 pr-10 font-num tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-body text-ink-3">원</span>
          </div>
          <p className="text-sub text-ink-3">비용은 임대인에게만 보여요.</p>
        </div>
        {extraFields}
        <div className="rounded-input bg-accent-soft/60 px-4 py-3 text-sub">
          <p className="font-semibold text-accent-strong">하우스 로그에 이렇게 남아요</p>
          <p className="mt-1 text-ink-2">
            &ldquo;{summaryTitle}&rdquo; · 처리 내용 · 비용 —{' '}
            {isVerified ? (
              <>
                인증된 호실이라 <b className="text-ink">호실 이력</b>으로 남고 다음 소유자도 봐요.
              </>
            ) : (
              <>
                <b className="text-ink">나만 보기</b>로 남아요.
              </>
            )}{' '}
            임차인이 쓴 글은 넣지 않아요.
          </p>
        </div>
        <p className="text-sub text-ink-3">완료하면 이후에는 바꿀 수 없어요.</p>
        {state.error && <NoticeBox>{state.error.message}</NoticeBox>}
      </div>
    </Modal>
  );
};

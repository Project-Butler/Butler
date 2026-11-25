import { getTicketStepIndex, TICKET_STEPS } from '../../utils/tickets';

// 진행 단계 막대(시안 v2.2 ①·⑥): 접수 → 처리 중 → 완료. 지난 단계는 채우고 지금 단계 글자만 진하게. 취소된 요청은 그리지 않는다.
// doneLabel: 완료 칸 옆에 붙일 글자(완료일 'MM-DD' 등).
export const TicketStepBar = ({ status, doneLabel }) => {
  const current = getTicketStepIndex(status);
  if (current < 0) return null;
  return (
    <ol aria-label={`진행 단계: ${TICKET_STEPS[current]}`} className="grid grid-cols-3 gap-1.5 text-center text-m-sub">
      {TICKET_STEPS.map((step, index) => (
        <li key={step} aria-current={index === current ? 'step' : undefined}>
          <span className={`block h-1 rounded-full ${index <= current ? 'bg-accent' : 'bg-line'}`} />
          <span
            className={`mt-1.5 block ${index === current ? 'font-semibold text-accent' : index < current ? 'text-ink-2' : 'text-ink-3'}`}
          >
            {step}
            {index === 2 && index === current && doneLabel && <span className="font-num tabular-nums"> {doneLabel}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
};

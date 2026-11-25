import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@butler/ui';
import { Check } from 'lucide-react';
import { ticketPath, TICKETS_PATH } from '../routes';

// 요청을 보낸 뒤(시안 v2.2 ④). 임대인이 처리를 시작하거나 끝내면 알림(위 막대 종)으로 알려 준다.
export const TicketSentPage = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center px-3 pt-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
        <Check size={32} strokeWidth={2} />
      </span>
      <h1 className="mt-5 text-m-h1 font-bold text-ink">요청을 보냈어요</h1>
      <p className="mt-2 text-body text-ink-2">
        임대인이 확인하면 알림으로 알려 드려요.
        <br />
        처리가 시작되기 전까지는 고치거나 취소할 수 있어요.
      </p>
      <div className="mt-8 grid w-full gap-2">
        <Button size="h52" onClick={() => navigate(ticketPath(ticketId), { replace: true })}>
          요청 보기
        </Button>
        <Button variant="secondary" size="h52" onClick={() => navigate(TICKETS_PATH, { replace: true })}>
          수리 요청 목록
        </Button>
      </div>
    </div>
  );
};

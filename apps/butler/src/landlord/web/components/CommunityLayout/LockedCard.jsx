import { Lock } from 'lucide-react';
import { Button, Card } from '@butler/ui';

// 인증 전 미리보기의 잠금 자리(글 본문 · 투표 선택지 자리). 서버가 내용을 주지 않으므로 여기서 숨기는 것은 없다 — 안내만 한다.
// description: 무엇이 잠겼는지 한 줄 · onVerify: 권리자 인증 화면으로(모르면 버튼을 막는다)
export const LockedCard = ({ description, onVerify }) => (
  <Card className="flex flex-col items-center gap-3 px-5 py-12 text-center">
    <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-3">
      <Lock size={20} strokeWidth={2} />
    </span>
    <p className="text-card font-semibold text-ink">인증한 임대인만 볼 수 있어요</p>
    <p className="break-keep text-body text-ink-2">{description}</p>
    <Button variant="verify" onClick={onVerify} disabled={!onVerify}>
      권리자 인증하기
    </Button>
  </Card>
);

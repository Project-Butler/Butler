import { Lock } from 'lucide-react';
import { Button } from '@butler/ui';
import { LOCKED_TITLE } from '../../../web/components/CommunityLayout/LockedCard';

// 인증 전 미리보기의 잠금 안내 — PC LockedCard 와 같은 문구(제목 · 무엇이 잠겼는지 · [권리자 인증하기]).
// 휴대폰에서는 큰 빈 상자 대신 작은 카드: 자물쇠 · 제목을 한 줄에, 설명, 버튼은 폭 전체 · 44px(남색 — 인증 안내에만)
export const AppLockedNotice = ({ description, onVerify }) => (
  <section aria-label={LOCKED_TITLE} className="space-y-2 rounded-card border border-line bg-surface p-4">
    <p className="flex items-center gap-2 text-m-card font-semibold text-ink">
      <Lock size={18} strokeWidth={2} aria-hidden="true" className="flex-none text-ink-3" />
      {LOCKED_TITLE}
    </p>
    <p className="break-keep text-m-label text-ink-2">{description}</p>
    <Button variant="verify" size="h44" className="w-full" onClick={onVerify} disabled={!onVerify}>
      권리자 인증하기
    </Button>
  </section>
);

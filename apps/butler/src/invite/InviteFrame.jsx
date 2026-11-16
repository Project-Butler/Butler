import { BackTopBar, TopBar } from '@butler/ui';

// 초대 화면의 틀. PC 에서 열어도 앱 모양(가운데 모바일 폭)이다(개발 계획 3-2).
// top: 'brand'(로고 바) | { title, onBack }(뒤로 가기 바) | null
// cta: 아래 고정 칸. ctaBar 면 흰 바탕 + 위 선(B3), 아니면 바탕색 그대로(B1·B2·C2).
// center: 본문을 세로 가운데(예외·완료 화면).
export const InviteFrame = ({ top = 'brand', cta, ctaBar = false, center = false, children }) => (
  <div data-shell="invite" className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-ground font-sans text-ink md:border-x md:border-line">
    {top === 'brand' ? <TopBar /> : top ? <BackTopBar title={top.title} onBack={top.onBack} /> : null}
    <main className={`flex flex-1 flex-col px-5 pb-6 pt-5 ${center ? 'items-center justify-center text-center' : 'gap-4'}`}>{children}</main>
    {cta && (
      <div className={`sticky bottom-0 z-10 flex flex-col gap-2 px-5 pb-7 pt-3 ${ctaBar ? 'border-t border-line bg-surface' : 'bg-ground'}`}>{cta}</div>
    )}
  </div>
);

// 예외·완료 화면 가운데 묶음: 둥근 아이콘 · 제목 · 설명.
const TONE = {
  warn: 'bg-warn-soft text-warn-ink',
  ok: 'bg-ok-soft text-ok-ink',
  seal: 'bg-seal-soft text-seal-ink',
};
export const StatusBlock = ({ icon: Icon, tone = 'warn', title, children, size = 'md' }) => (
  <>
    <span className={`flex items-center justify-center rounded-full ${TONE[tone]} ${size === 'lg' ? 'h-16 w-16' : 'h-14 w-14'}`}>
      <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
    </span>
    <h1 className="mt-4 text-m-h1 font-bold text-ink">{title}</h1>
    {children && <div className="mt-1 text-body text-ink-2">{children}</div>}
  </>
);

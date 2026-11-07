import { BackTopBar } from './BackTopBar';

// 입력 화면의 틀 (Figma M02·M04): 위 뒤로 가기 상단 바 · 가운데 본문 · 아래 고정 버튼 칸(BottomCTA). 하단 탭은 없다.
// 폭은 MobileShell 과 같다(최대 430px 가운데). topBar: BackTopBar props. cta: 아래 칸에 넣을 버튼(들).
// onSubmit 을 주면 본문과 아래 칸을 form 으로 감싼다. overlay(대화 창 등)는 form 밖에 그린다 —
// 안에 두면 대화 창 속 form 의 제출 이벤트가 React 트리를 타고 바깥 form 의 onSubmit 까지 올라온다.
// 본문은 위 16px · 양옆 20px · 아래 24px 여백에 칸 사이 16px. 아래 칸은 위 12px · 아래 28px 여백, 위쪽 선은 line.
export const MobileFormLayout = ({ shell, topBar, cta, onSubmit, overlay, children }) => {
  const Body = onSubmit ? 'form' : 'div';
  return (
    <div data-shell={shell} className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-ground font-sans text-ink md:border-x md:border-line">
      <BackTopBar {...topBar} />
      <Body onSubmit={onSubmit} noValidate={onSubmit ? true : undefined} className="flex flex-1 flex-col">
        <main className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-4">{children}</main>
        {cta && <div className="sticky bottom-0 z-10 flex gap-2.5 border-t border-line bg-surface px-5 pb-7 pt-3">{cta}</div>}
      </Body>
      {overlay}
    </div>
  );
};

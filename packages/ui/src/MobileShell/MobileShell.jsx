import { BackTopBar } from './BackTopBar';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

// 앱 화면의 틀: 위 상단 바 · 가운데 본문 · 아래 탭.
// 폭은 모바일 폭(430px)을 넘지 않고 가운데에 놓인다 — 휴대폰에서는 화면 전체, PC에서는 가운데 모바일 폭(양옆 선).
// shell: 셸을 구분하는 표지(data-shell). topBar: TopBar props. tabs: TabBar items.
// backBar: BackTopBar props — 주면 홈형 TopBar 대신 뒤로 가기 상단 바를 그린다(하단 탭이 있는 상세 화면, M06·M08).
export const MobileShell = ({ shell, topBar, backBar, tabs, children }) => (
  <div data-shell={shell} className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-ground font-sans text-ink md:border-x md:border-line">
    {backBar ? <BackTopBar {...backBar} /> : <TopBar {...topBar} />}
    <main className="flex-1 px-5 pb-6 pt-4">{children}</main>
    <TabBar items={tabs} />
  </div>
);

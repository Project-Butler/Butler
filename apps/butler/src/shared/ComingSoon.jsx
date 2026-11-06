import { Card } from '@butler/ui';

// 앱 화면이 아직 없는 주소의 자리(임대인 앱·임차인 앱이 같이 쓴다). 표가 많은 웹 화면을 모바일에 그대로 보여 주지 않고, 앱 셸 안에 이 안내를 둔다.
// 앱 화면은 #98 부터 하나씩 만든다. children 은 안내 아래에 붙일 것(예: 내 정보의 로그아웃).
export const ComingSoon = ({ title, children }) => (
  <section aria-label="준비 중" className="space-y-4">
    <h1 className="text-h1 font-semibold text-ink">{title}</h1>
    <Card>
      <p className="text-card font-semibold text-ink">앱 화면을 준비하고 있어요</p>
      <p className="mt-1 text-body text-ink-2">준비 중입니다. 조금만 기다려 주세요.</p>
    </Card>
    {children}
  </section>
);

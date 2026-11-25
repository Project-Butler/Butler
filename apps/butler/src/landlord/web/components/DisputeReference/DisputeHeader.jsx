import { useOutletContext } from 'react-router-dom';
import { PageHeader } from '../PageHeader/PageHeader';

// 분쟁 화면의 제목 줄. 웹은 PageHeader.
// 앱의 하위 화면(onBack 이 있는 화면)은 제목·뒤로가 상단 바(BackTopBar)에 있고, 설명 줄도 두지 않는다
// (A팀 앱의 둘러보는 화면처럼 상단 바 아래 바로 본문 — 검색창·분쟁 유형이 할 일을 보여 준다).
// 앱의 첫 화면(onBack 이 없는 화면)은 하단 탭 '분쟁 센터'의 첫 화면이라 홈형 상단 바를 쓰므로,
// 다른 탭 첫 화면(홈·내 자산)처럼 본문 맨 위에 제목만 둔다.
export const DisputeHeader = ({ title, description, onBack }) => {
  const { isApp } = useOutletContext();
  if (isApp) return onBack ? null : <h1 className="text-page-sm font-bold text-ink">{title}</h1>;
  return <PageHeader title={title} description={description} onBack={onBack} />;
};

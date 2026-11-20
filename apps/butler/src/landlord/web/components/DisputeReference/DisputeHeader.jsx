import { useOutletContext } from 'react-router-dom';
import { PageHeader } from '../PageHeader/PageHeader';

// 분쟁 화면의 제목 줄. 웹은 PageHeader. 앱은 제목·뒤로가 상단 바(BackTopBar)에 있고, 설명 줄도 두지 않는다
// (A팀 앱의 둘러보는 화면처럼 상단 바 아래 바로 본문 — 검색창·분쟁 유형이 할 일을 보여 준다).
export const DisputeHeader = ({ title, description, onBack }) => {
  const { isApp } = useOutletContext();
  if (isApp) return null;
  return <PageHeader title={title} description={description} onBack={onBack} />;
};

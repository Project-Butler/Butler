import { Outlet, useLocation, useNavigate } from 'react-router-dom';

// 임대차 분쟁(3팀 피처). 첫 화면·상황 안내·자료 찾기·사례 상세(Outlet)를 감싸고, 하위 화면이 같이 쓰는 이동 함수를 넘긴다.
// AI 상담은 별도 화면(/disputes/chat)이다. 입구는 "찾다가 없을 때"만 둔다 — 자료 찾기 맨 끝, 상황 안내 맨 끝, 사례 상세 하단 버튼.
// (네이버·카카오 고객센터처럼 도움말을 다 본 뒤에 묻게 해서, 실수로 AI를 부르지 않게 한다.)
// isApp: 앱 화면(landlord/app의 DisputeAppLayout)이 감쌀 때 true. 하위 화면은 제목 줄을 상단 바에 맡긴다(DisputeHeader).
export const DisputePage = ({ onNavigate, onUnauthorized, isApp = false }) => {
  const location = useLocation();
  const routerNavigate = useNavigate();

  // draft: 챗봇 입력창에 미리 넣을 질문(history state로 넘긴다)
  const askAi = (draft) => onNavigate('disputeChat', { draft });
  const openReference = (referenceId) => onNavigate('disputeReference', { referenceId });
  // 하위 화면의 뒤로: 앱 안에서 왔으면 보던 화면(검색 조건 그대로)으로, 주소로 바로 들어왔으면 첫 화면으로.
  const goBack = () => (location.key !== 'default' ? routerNavigate(-1) : onNavigate('disputes'));

  // 한글이 단어 중간에서 줄이 바뀌지 않게("드/려요", "보/증금") 띄어쓰기에서만 줄을 바꾼다(break-keep, 아래 화면에 이어짐).
  // 한 단어가 줄보다 길면 그때만 끊는다(break-words). contents라 틀의 배치는 바뀌지 않는다.
  return (
    <div className="contents break-keep break-words">
      <Outlet context={{ askAi, openReference, goBack, onNavigate, onUnauthorized, isApp }} />
    </div>
  );
};

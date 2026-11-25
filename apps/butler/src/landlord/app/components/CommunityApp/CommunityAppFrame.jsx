import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@butler/ui';
import { PREVIEW_NOTICE_TEXT } from '../../../web/components/CommunityLayout/PreviewNotice';
import { NoticeBox } from '../../../web/components/NoticeBox/NoticeBox';
import { BuildingTitle, HeaderInfoLine, SectionChips } from './CommunityAppHeader';

// 앱 틀(CommunityAppLayout)이 상단 바 왼쪽에 비워 둔 자리 — 화면 틀이 그 자리에 "단지 이름 ▾" 를 그린다(portal).
// 건물 · 건물 목록 · 건물 바꾸기는 커뮤니티 안(CommunityPage)에 있어서, 상단 바를 그리는 앱 틀이 직접 그리지 못한다.
// slot: 그릴 자리(DOM) · setHasTitle: 화면 틀이 있는 동안 true — 앱 틀은 그동안 대신 쓰던 "커뮤니티" 글자를 감춘다
export const CommunityAppTopBarContext = createContext({ slot: null, setHasTitle: () => {} });

// 앱 커뮤니티 화면 · 시트 · 상단 바 이름은 한글을 낱말 단위로 줄 바꿈한다(break-keep — "아파/트" 처럼 낱말 안에서 끊지 않게).
// 한 낱말이 한 줄보다 길 때만 낱말 안에서 끊는다(break-words). PC 는 그대로.

// 상단 바(공용 TopBar) 높이 — 칩 줄이 그 밑에 붙게. 단지 이름이 두 줄이면 상단 바가 높아지므로 잰다(기본 53px = TopBar min-h)
const useTopBarHeight = () => {
  const [height, setHeight] = useState(53);
  useEffect(() => {
    const header = document.querySelector('[data-shell="landlord-app"] > header');
    if (!header) return undefined;
    const update = () => setHeight(Math.round(header.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return height;
};

// 미리보기(인증 전 · 만료) 안내 — PC 와 같은 문구, 버튼은 아래 폭 전체 · 44px(남색 — 인증 안내에만)
const AppPreviewNotice = ({ onVerify }) => (
  <NoticeBox tone="seal">
    <p className="break-keep text-m-label">{PREVIEW_NOTICE_TEXT}</p>
    <Button variant="verify" size="h44" className="mt-2.5 w-full" onClick={onVerify} disabled={!onVerify}>
      권리자 인증하기
    </Button>
  </NoticeBox>
);

// 탭 첫 화면(브리핑 · 뉴스 · 시세 · 게시판 · 투표)의 틀. 받는 것은 PC CommunityFrame 과 같다(frame · section · scopeText · blockedReason).
// 머리(상단 바 단지 이름 · 정보 한 줄 · 칩 줄) → 미리보기 안내 → 범위 한 줄 → 내용 → 닉네임 시트.
// hasFloatingAction: 떠 있는 [글쓰기] · [투표 만들기]가 있는 목록 — 마지막 줄이 버튼에 가리지 않게 아래를 더 비운다
export const CommunityAppFrame = ({ frame, section, scopeText, blockedReason = null, hasFloatingAction = false, children }) => {
  const { slot, setHasTitle } = useContext(CommunityAppTopBarContext);
  const topBarHeight = useTopBarHeight();
  const reason = blockedReason ?? frame.preview?.reason ?? null;

  useEffect(() => {
    setHasTitle(true);
    return () => setHasTitle(false);
  }, [setHasTitle]);

  return (
    <div className={`space-y-4 break-keep break-words ${hasFloatingAction ? 'pb-16' : ''}`}>
      {slot &&
        createPortal(<BuildingTitle building={frame.building} buildings={frame.buildings} onSelectBuilding={frame.onSelectBuilding} />, slot)}
      <div className="-mt-2 space-y-1">
        <HeaderInfoLine building={frame.building} reason={reason} nickname={frame.nickname} />
        <SectionChips activeSection={section} top={topBarHeight} />
      </div>
      {reason && <AppPreviewNotice onVerify={frame.verify} />}
      {scopeText && <p className="break-words text-m-label text-ink-2">{scopeText}</p>}
      {children}
      {frame.nickname?.dialog}
    </div>
  );
};

// 하위 화면(글 상세 · 투표 상세)의 틀 — 머리 · 칩 줄 없이(앱 뒤로 가기 바가 대신) 미리보기 안내 · 내용 · 닉네임 시트
export const CommunityAppSubFrame = ({ frame, blockedReason = null, children }) => {
  const reason = blockedReason ?? frame.preview?.reason ?? null;
  return (
    <div className="space-y-4 break-keep break-words">
      {reason && <AppPreviewNotice onVerify={frame.verify} />}
      {children}
      {frame.nickname?.dialog}
    </div>
  );
};

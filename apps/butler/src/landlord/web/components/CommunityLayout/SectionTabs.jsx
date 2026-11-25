import { useNavigate } from 'react-router-dom';
import { COMMUNITY_PATH } from '../../routes';

// 커뮤니티 탭 다섯 개. 경로는 /landlord/community/{key}. 자주 바뀌는 것이 앞으로 — 첫 화면은 브리핑.
export const COMMUNITY_SECTIONS = [
  { key: 'briefing', label: '브리핑' },
  { key: 'news', label: '뉴스' },
  { key: 'market', label: '시세' },
  { key: 'board', label: '게시판' },
  { key: 'polls', label: '투표' },
];

// 앱(임대인 앱)의 탭 대신 쓰는 가로 칩 줄 — 탭 줄과 같은 목록 · 이름 · 순서 · 주소(COMMUNITY_SECTIONS 하나를 같이 쓴다).
// 모양은 공용 FilterChip 과 같은 토큰(켜진 칩 accent-soft · 꺼진 칩 surface + line 테두리) — 연회색 바탕(ground) 위에서도 칩이 보이게.
// 넘치면 가로로 밀어 본다(줄바꿈 없음). 하위 화면에서는 그리지 않는다(뒤로 가기 바가 대신 — CommunityFrame).
export const SectionChips = ({ activeSection }) => {
  const navigate = useNavigate();
  return (
    <nav aria-label="커뮤니티 메뉴" className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
      {COMMUNITY_SECTIONS.map((section) => {
        const isActive = section.key === activeSection;
        return (
          <button
            key={section.key}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => navigate(`${COMMUNITY_PATH}/${section.key}`)}
            className={`flex h-9 flex-none items-center whitespace-nowrap rounded-full border px-3.5 text-label transition-colors ${
              isActive ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-surface font-medium text-ink-2'
            }`}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
};

// 탭 줄: 왼쪽 정렬, 글자만큼의 폭, 선택 탭은 아래 2px accent 선 + ink 600. 줄 전체 아래 line.
// 하위 화면(글 상세·글쓰기·투표 상세·투표 만들기)에서도 그 탭을 선택된 채로 보여 준다.
export const SectionTabs = ({ activeSection }) => {
  const navigate = useNavigate();
  return (
    <nav aria-label="커뮤니티 메뉴" className="flex border-b border-line">
      {COMMUNITY_SECTIONS.map((section) => {
        const isActive = section.key === activeSection;
        return (
          <button
            key={section.key}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => navigate(`${COMMUNITY_PATH}/${section.key}`)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-body transition-colors ${
              isActive ? 'border-accent font-semibold text-ink' : 'border-transparent font-medium text-ink-3 hover:text-ink'
            }`}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
};

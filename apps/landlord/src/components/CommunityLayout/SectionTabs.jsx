import { useNavigate } from 'react-router-dom';

// 커뮤니티 탭 네 개. 경로는 /community/{key}.
export const COMMUNITY_SECTIONS = [
  { key: 'market', label: '시세' },
  { key: 'news', label: '뉴스' },
  { key: 'board', label: '게시판' },
  { key: 'polls', label: '투표' },
];

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
            onClick={() => navigate(`/community/${section.key}`)}
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

import { getCategoryLabel } from '../../utils/communityBoardLabels';

// 글 분류 칩(사각 회색 칩). 게시판 표의 분류 칸과 글 상세가 같이 쓴다.
export const CategoryChip = ({ category }) => (
  <span className="inline-flex h-6 items-center whitespace-nowrap rounded-chip bg-surface-2 px-2 text-chip font-semibold text-ink-2">
    {getCategoryLabel(category)}
  </span>
);

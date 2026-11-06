import { useGetCommunityPostList } from '../../hooks/useGetCommunityPostList';
import { formatKstShortDate } from '../../utils/communityFormat';
import { CategoryChip } from '../CommunityBoard/CategoryChip';
import { BRIEFING_ERROR_TEXT, BRIEFING_LOADING_TEXT, BriefingNote } from './BriefingNote';
import { BriefingSection } from './BriefingSection';

export const BRIEFING_POST_SIZE = 5;

// 브리핑 — 최근 게시글: 게시판 목록 API 를 5건만. 분류 칩 · 제목(한 줄) · 댓글 수 · 날짜.
// 줄을 누르면 글 상세 — 인증 전이면 서버가 본문을 주지 않아 잠금 화면이 된다.
export const BriefingPosts = ({ building, dongName, onOpen, onMore, className = '' }) => {
  const list = useGetCommunityPostList({ legalDongCode: building.legalDongCode, size: BRIEFING_POST_SIZE });
  const posts = list.data?.pages[0]?.data ?? [];

  let body;
  if (list.isPending) body = <BriefingNote>{BRIEFING_LOADING_TEXT}</BriefingNote>;
  else if (list.isError) body = <BriefingNote tone="error">{BRIEFING_ERROR_TEXT}</BriefingNote>;
  else if (posts.length === 0) body = <BriefingNote>아직 올라온 글이 없습니다</BriefingNote>;
  else {
    body = (
      <ul>
        {posts.map((post) => (
          <li key={post.id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => onOpen(post.id)}
              className="flex w-full items-center gap-2.5 px-5 py-3 text-left hover:bg-surface-2"
            >
              <CategoryChip category={post.category} />
              <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">{post.title}</span>
              {post.commentCount > 0 && (
                <span className="flex-none font-num text-chip font-semibold tabular-nums text-accent-strong" aria-label={`댓글 ${post.commentCount}개`}>
                  [{post.commentCount}]
                </span>
              )}
              <span className="flex-none font-num text-sub tabular-nums text-ink-3">{formatKstShortDate(post.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <BriefingSection title="최근 게시글" scope={dongName} onMore={onMore} className={className}>
      {body}
    </BriefingSection>
  );
};

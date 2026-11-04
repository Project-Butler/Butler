import { MessageCircle } from 'lucide-react';
import { formatKstDate } from '../../utils/communityFormat';

// 게시판 글 한 줄(모바일 목록 카드): 제목 / 작성자 표기 · 날짜 + 댓글 수. 줄 전체가 눌린다.
// PC 게시판은 표(CommunityPostListPage)라 지금은 쓰지 않는다 — 모바일 화면을 다시 붙일 때 쓰려고 남겨 둔다.
export const PostListItem = ({ post, onOpen }) => (
  <li className="border-t border-line first:border-t-0">
    <button type="button" onClick={() => onOpen(post.id)} className="block w-full py-3.5 text-left text-ink">
      <h3 className="mb-1 text-body font-semibold">{post.title}</h3>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sub leading-tight text-ink-3">
          {post.authorLabel} · <span className="font-num font-medium tabular-nums">{formatKstDate(post.createdAt)}</span>
        </span>
        <span className="flex flex-none items-center gap-1 text-chip font-semibold text-ink-3" aria-label={`댓글 ${post.commentCount}개`}>
          <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />
          <span className="font-num tabular-nums">{post.commentCount}</span>
        </span>
      </div>
    </button>
  </li>
);

import { formatKstShortDate } from '../../utils/communityFormat';
import { AuthorName } from '../CommunityNickname/AuthorName';
import { CategoryChip } from './CategoryChip';

// 게시판 글 한 줄 — 앱(임대인 앱) 게시판 목록. PC 는 표(CommunityPostListPage)라 앱에서만 쓴다.
// 좁은 화면에 표 네 칸(분류 · 제목 · 작성자 · 작성일)이 들어가지 않아 같은 칸을 두 줄로 놓았다 — 문구 · 표기는 PC 표와 같다:
//   1줄 분류 칩 · 제목 · 댓글 수 [n](있을 때만)   2줄 작성자("닉네임 (괄호 표기)") · 작성일(MM-DD)
// 줄 전체가 눌린다. 제목은 자르지 않고 줄을 바꾼다(PC 표도 제목 칸에서 줄을 바꾼다).
export const PostListItem = ({ post, onOpen }) => (
  <li className="border-t border-line first:border-t-0">
    <button type="button" onClick={() => onOpen(post.id)} className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left hover:bg-surface-2">
      <span className="flex min-w-0 items-start gap-2">
        <span className="flex-none">
          <CategoryChip category={post.category} />
        </span>
        <span className="min-w-0 break-words pt-0.5 text-body font-semibold text-ink">
          {post.title}
          {post.commentCount > 0 && (
            <span className="ml-1.5 font-num text-chip font-semibold tabular-nums text-accent-strong" aria-label={`댓글 ${post.commentCount}개`}>
              [{post.commentCount}]
            </span>
          )}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex min-w-0 flex-1">
          <AuthorName nickname={post.authorNickname} label={post.authorLabel} />
        </span>
        <span className="flex-none font-num text-body tabular-nums text-ink-3">{formatKstShortDate(post.createdAt)}</span>
      </span>
    </button>
  </li>
);

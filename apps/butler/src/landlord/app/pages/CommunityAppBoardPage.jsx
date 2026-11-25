import { Pencil } from 'lucide-react';
import { BRIEFING_LOADING_TEXT } from '../../web/components/CommunityBriefing/BriefingNote';
import { CATEGORY_FILTERS, usePostListState } from '../../web/pages/CommunityPostListPage';
import { getBlockedMessage } from '../../web/utils/communityBoardLabels';
import { getErrorMessage } from '../../web/utils/getErrorMessage';
import { AppMoreButton, AppNote } from '../components/CommunityApp/AppCard';
import { AppChipGroup, AppFloatingButton, AppMineToggle } from '../components/CommunityApp/AppControls';
import { AppPostRow } from '../components/CommunityApp/AppListRows';
import { CommunityAppFrame } from '../components/CommunityApp/CommunityAppFrame';

// 앱 게시판 — PC 게시판 목록(CommunityPostListPage)의 휴대폰 배치. 데이터 · 필터(주소 ?category=&mine=true) · 열기 · 글쓰기(닉네임 먼저)는
// PC 와 같은 훅(usePostListState). 표 대신 목록 한 줄(제목 맨 위 · 분류 · 닉네임 · 날짜 · [댓글 수]), [글쓰기]는 떠 있는 버튼.
// 빈 상태는 카드 안 한 줄(PC 빈 상태와 같은 두 문장).
export const CommunityAppBoardPage = ({ frame, building }) => {
  const { category, mine, setFilter, list, posts, canWrite, blockedReason, dongName, openPost, openWrite } = usePostListState({ frame, building });

  return (
    <CommunityAppFrame frame={frame} section="board" scopeText={`${dongName} 임대인`} blockedReason={blockedReason} hasFloatingAction>
      <div className="space-y-1">
        <AppChipGroup label="게시판 분류" options={CATEGORY_FILTERS} value={category} onChange={(value) => setFilter({ category: value })} />
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <AppMineToggle checked={mine} onChange={(value) => setFilter({ mine: value })} />
          {list.isSuccess && !canWrite && <span className="break-words text-m-sub text-ink-3">{getBlockedMessage(blockedReason)}</span>}
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {list.isPending && <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>}
        {list.isError && <AppNote tone="error">{getErrorMessage(list.error)}</AppNote>}
        {list.isSuccess &&
          (posts.length === 0 ? (
            <AppNote>아직 글이 없습니다. 첫 글을 남겨 보세요.</AppNote>
          ) : (
            <>
              <ul aria-label="게시글">
                {posts.map((post) => (
                  <AppPostRow key={post.id} post={post} onOpen={openPost} />
                ))}
              </ul>
              <AppMoreButton list={list} />
            </>
          ))}
      </div>

      <AppFloatingButton icon={Pencil} label="글쓰기" onClick={openWrite} disabled={!list.isSuccess || !canWrite} />
    </CommunityAppFrame>
  );
};

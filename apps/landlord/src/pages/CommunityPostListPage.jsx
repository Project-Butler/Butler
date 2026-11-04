import { Pencil } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetCommunityPostList } from '../hooks/useGetCommunityPostList';
import { getErrorMessage } from '../utils/getErrorMessage';
import { getBlockedMessage, POST_CATEGORIES } from '../utils/communityBoardLabels';
import { CategoryChip } from '../components/CommunityBoard/CategoryChip';
import { ChipGroup } from '../components/CommunityBoard/ChipGroup';
import { MineToggle } from '../components/CommunityBoard/MineToggle';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { EmptyState } from '../components/CommunityLayout/EmptyState';
import { LoadingStatus } from '../components/CommunityLayout/LoadingStatus';
import { formatKstShortDate, splitRegionName } from '../utils/communityFormat';

// "전체"는 분류를 보내지 않는다(서버가 category 없이도 받는다).
const CATEGORY_ALL = 'ALL';
const CATEGORY_FILTERS = [{ value: CATEGORY_ALL, label: '전체' }, ...POST_CATEGORIES];

// 게시판 목록 화면.
// 법정동 단위 — 다른 단지 글이 섞여 보이는 것이 의도다. 분류·내 글 필터는 주소의 쿼리(?category=&mine=true)에 두어
// 새로고침·뒤로가기에도 남는다. 목록은 "더 보기"로 이어 붙인다. 표는 BuildingListPage 와 같은 클래스.
export const CommunityPostListPage = ({ frame, building }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = POST_CATEGORIES.some((item) => item.value === searchParams.get('category'))
    ? searchParams.get('category')
    : CATEGORY_ALL;
  const mine = searchParams.get('mine') === 'true';
  const list = useGetCommunityPostList({
    legalDongCode: building.legalDongCode,
    category: category === CATEGORY_ALL ? undefined : category,
    mine,
  });

  const firstMeta = list.data?.pages[0]?.meta;
  const canWrite = firstMeta?.canWrite ?? false;
  const blockedReason = firstMeta?.writeBlockedReason ?? null;
  const posts = list.data?.pages.flatMap((page) => page.data) ?? [];
  const dongName = firstMeta?.region.dongName ?? splitRegionName(building.regionName).dong;

  // 기본값(전체 · 내 글 꺼짐)은 주소에 쓰지 않는다.
  const setFilter = (next) => {
    const filter = { category, mine, ...next };
    const query = new URLSearchParams();
    if (filter.category !== CATEGORY_ALL) query.set('category', filter.category);
    if (filter.mine) query.set('mine', 'true');
    setSearchParams(query, { replace: true });
  };
  const openPost = (postId) => navigate(`/community/posts/${postId}`);
  const openWrite = () => navigate(category === CATEGORY_ALL ? '/community/posts/new' : `/community/posts/new?category=${category}`);

  return (
    <CommunityFrame frame={frame} section="board" scopeText={`${dongName} 임대인`} blockedReason={blockedReason}>
      <div className="flex flex-wrap items-center gap-3">
        <ChipGroup label="게시판 분류" options={CATEGORY_FILTERS} value={category} onChange={(value) => setFilter({ category: value })} wrap />
        <MineToggle checked={mine} onChange={(value) => setFilter({ mine: value })} />
        {list.isSuccess && !canWrite && (
          <span className="ml-auto text-sub text-ink-3">{getBlockedMessage(blockedReason)}</span>
        )}
        <Button className={list.isSuccess && !canWrite ? '' : 'ml-auto'} onClick={openWrite} disabled={!list.isSuccess || !canWrite}>
          <Pencil size={16} className="-ml-0.5 mr-1.5 inline-block" aria-hidden="true" />
          글쓰기
        </Button>
      </div>

      {list.isPending && <LoadingStatus />}
      {list.isError && <NoticeBox>{getErrorMessage(list.error)}</NoticeBox>}

      {list.isSuccess &&
        (posts.length === 0 ? (
          // 게시판 빈 상태
          <EmptyState title="아직 글이 없습니다." description="첫 글을 남겨 보세요." />
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="w-full text-body">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-chip text-ink-3">
                  <th className="w-28 px-5 py-2.5 font-medium">분류</th>
                  <th className="px-3 py-2.5 font-medium">제목</th>
                  <th className="px-3 py-2.5 font-medium">작성자</th>
                  <th className="w-24 px-5 py-2.5 font-medium">작성일</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    onClick={() => openPost(post.id)}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-5 py-3.5">
                      <CategoryChip category={post.category} />
                    </td>
                    <td className="px-3 py-3.5">
                      {/* 키보드로도 열 수 있게 제목은 버튼. 행 클릭과 겹치지 않게 전파를 막는다 */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openPost(post.id);
                        }}
                        className="text-left font-semibold text-ink"
                      >
                        {post.title}
                      </button>
                      {post.commentCount > 0 && (
                        <span className="ml-1.5 font-num text-chip font-semibold tabular-nums text-accent-strong" aria-label={`댓글 ${post.commentCount}개`}>
                          [{post.commentCount}]
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-ink-2">{post.authorLabel}</td>
                    <td className="px-5 py-3.5 font-num tabular-nums text-ink-3">{formatKstShortDate(post.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.hasNextPage && (
              <div className="border-t border-line p-4 text-center">
                <Button variant="secondary" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  {list.isFetchingNextPage ? '불러오는 중' : '더 보기'}
                </Button>
              </div>
            )}
          </Card>
        ))}
    </CommunityFrame>
  );
};

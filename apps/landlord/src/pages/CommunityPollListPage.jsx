import { Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetCommunityPollList } from '../hooks/useGetCommunityPollList';
import { getErrorMessage } from '../utils/getErrorMessage';
import { ChipGroup } from '../components/CommunityBoard/ChipGroup';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { EmptyState } from '../components/CommunityLayout/EmptyState';
import { LoadingStatus } from '../components/CommunityLayout/LoadingStatus';
import { PollCard } from '../components/CommunityPoll/PollCard';
import { PollDisclaimer } from '../components/CommunityPoll/PollDisclaimer';
import { StatusSegment } from '../components/CommunityPoll/StatusSegment';
import { splitRegionName } from '../utils/communityFormat';

const SCOPE_ALL = 'ALL';

// 투표 목록 화면.
// 도구 줄: 범위 칩(전체 · 우리 단지 · 법정동) + 진행중/마감 + [투표 만들기], 아래 면책 문구(상시), 카드 두 칸.
// 필터는 주소 쿼리(?scope=COMPLEX|REGION&status=CLOSED)에 둔다. "우리 단지"는 현재 건물의 단지다.
// 만들기 버튼은 법정동 자격이 있을 때만(목록 meta canWrite).
export const CommunityPollListPage = ({ frame, building }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = ['COMPLEX', 'REGION'].includes(searchParams.get('scope')) ? searchParams.get('scope') : SCOPE_ALL;
  const status = searchParams.get('status') === 'CLOSED' ? 'CLOSED' : 'OPEN';
  const list = useGetCommunityPollList({
    legalDongCode: building.legalDongCode,
    scope: scope === SCOPE_ALL ? undefined : scope,
    status,
    complexId: building.complexId,
  });

  const firstMeta = list.data?.pages[0]?.meta;
  const dongName = firstMeta?.region.dongName ?? splitRegionName(building.regionName).dong;
  const canWrite = firstMeta?.canWrite ?? false;
  const blockedReason = firstMeta?.writeBlockedReason ?? null;
  const polls = list.data?.pages.flatMap((page) => page.data) ?? [];

  // 기본값(전체·진행중)은 주소에 쓰지 않는다.
  const setFilter = (next) => {
    const filter = { scope, status, ...next };
    const query = new URLSearchParams();
    if (filter.scope !== SCOPE_ALL) query.set('scope', filter.scope);
    if (filter.status === 'CLOSED') query.set('status', 'CLOSED');
    setSearchParams(query, { replace: true });
  };

  return (
    <CommunityFrame frame={frame} section="polls" scopeText={`${dongName} 임대인`} blockedReason={blockedReason}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <ChipGroup
            label="투표 범위"
            options={[
              { value: SCOPE_ALL, label: '전체' },
              { value: 'COMPLEX', label: '우리 단지' },
              { value: 'REGION', label: dongName || '법정동' },
            ]}
            value={scope}
            onChange={(value) => setFilter({ scope: value })}
            wrap
          />
          <StatusSegment className="w-44" value={status} onChange={(value) => setFilter({ status: value })} />
          <Button className="ml-auto" onClick={() => navigate('/community/polls/new')} disabled={!list.isSuccess || !canWrite}>
            <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" aria-hidden="true" />
            투표 만들기
          </Button>
        </div>
        <PollDisclaimer />
      </div>

      {list.isPending && <LoadingStatus />}
      {list.isError && <NoticeBox>{getErrorMessage(list.error)}</NoticeBox>}

      {list.isSuccess &&
        (polls.length === 0 ? (
          <EmptyState title={status === 'CLOSED' ? '마감된 투표가 없습니다.' : '진행 중인 투표가 없습니다.'} />
        ) : (
          <>
            <ul aria-label="투표" className="grid gap-4 lg:grid-cols-2">
              {polls.map((poll) => (
                <PollCard key={poll.id} poll={poll} dongName={dongName} onOpen={(id) => navigate(`/community/polls/${id}`)} />
              ))}
            </ul>
            {list.hasNextPage && (
              <div className="text-center">
                <Button variant="secondary" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  {list.isFetchingNextPage ? '불러오는 중' : '더 보기'}
                </Button>
              </div>
            )}
          </>
        ))}
    </CommunityFrame>
  );
};

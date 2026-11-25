import { Plus } from 'lucide-react';
import { BRIEFING_LOADING_TEXT } from '../../web/components/CommunityBriefing/BriefingNote';
import { PollDisclaimer } from '../../web/components/CommunityPoll/PollDisclaimer';
import { POLL_STATUSES } from '../../web/components/CommunityPoll/StatusSegment';
import { usePollListState } from '../../web/pages/CommunityPollListPage';
import { getBlockedMessage } from '../../web/utils/communityBoardLabels';
import { getErrorMessage } from '../../web/utils/getErrorMessage';
import { AppMoreButton, AppNote } from '../components/CommunityApp/AppCard';
import { AppChipGroup, AppFloatingButton, AppSegment } from '../components/CommunityApp/AppControls';
import { AppPollRow } from '../components/CommunityApp/AppListRows';
import { CommunityAppFrame } from '../components/CommunityApp/CommunityAppFrame';

// 앱 투표 목록 — PC 투표 목록(CommunityPollListPage)의 휴대폰 배치. 데이터 · 필터(?scope=&status=) · 열기 · 만들기(닉네임 먼저)는
// PC 와 같은 훅(usePollListState). PC 의 카드 두 칸 → 목록 한 줄(제목 맨 위 · 범위 · D-day · 참여 · 참여함), [투표 만들기]는 떠 있는 버튼.
// 면책 문구는 PC 처럼 도구 줄 아래에 늘 둔다.
export const CommunityAppPollsPage = ({ frame, building }) => {
  const { scope, status, setFilter, list, polls, dongName, canWrite, blockedReason, scopeOptions, openCreate, openPoll } = usePollListState({
    frame,
    building,
  });

  return (
    <CommunityAppFrame frame={frame} section="polls" scopeText={`${dongName} 임대인`} blockedReason={blockedReason} hasFloatingAction>
      <div className="space-y-2">
        <AppChipGroup label="투표 범위" options={scopeOptions} value={scope} onChange={(value) => setFilter({ scope: value })} />
        <AppSegment label="투표 상태" options={POLL_STATUSES} value={status} onChange={(value) => setFilter({ status: value })} />
        {list.isSuccess && !canWrite && <p className="break-words text-m-sub text-ink-3">{getBlockedMessage(blockedReason, 'poll')}</p>}
        <PollDisclaimer />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {list.isPending && <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>}
        {list.isError && <AppNote tone="error">{getErrorMessage(list.error)}</AppNote>}
        {list.isSuccess &&
          (polls.length === 0 ? (
            <AppNote>{status === 'CLOSED' ? '마감된 투표가 없습니다.' : '진행 중인 투표가 없습니다.'}</AppNote>
          ) : (
            <>
              <ul aria-label="투표">
                {polls.map((poll) => (
                  <AppPollRow key={poll.id} poll={poll} dongName={dongName} onOpen={openPoll} />
                ))}
              </ul>
              <AppMoreButton list={list} />
            </>
          ))}
      </div>

      <AppFloatingButton icon={Plus} label="투표 만들기" onClick={openCreate} disabled={!list.isSuccess || !canWrite} />
    </CommunityAppFrame>
  );
};

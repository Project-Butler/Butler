import { useGetCommunityPollList } from '../../hooks/useGetCommunityPollList';
import { PollCard } from '../CommunityPoll/PollCard';
import { BRIEFING_ERROR_TEXT, BRIEFING_LOADING_TEXT, BriefingNote } from './BriefingNote';
import { BriefingSection } from './BriefingSection';

export const BRIEFING_POLL_SIZE = 3;

// 브리핑 — 최근 투표: 진행 중인 것 먼저 최대 3개, 모자라면 최근 마감한 것으로 채운다. 투표 카드는 투표 목록 것 그대로.
// 카드를 누르면 투표 상세 — 인증 전이면 서버가 선택지 · 결과를 주지 않아 잠금 화면이 된다.
export const BriefingPolls = ({ building, dongName, onOpen, onMore, className = '' }) => {
  const base = { legalDongCode: building.legalDongCode, complexId: building.complexId, size: BRIEFING_POLL_SIZE };
  const open = useGetCommunityPollList({ ...base, status: 'OPEN' });
  const openPolls = open.data?.pages[0]?.data ?? [];
  const needsClosed = open.isSuccess && openPolls.length < BRIEFING_POLL_SIZE;
  const closed = useGetCommunityPollList({ ...base, status: 'CLOSED', enabled: needsClosed });
  const polls = [...openPolls, ...((needsClosed && closed.data?.pages[0]?.data) || [])].slice(0, BRIEFING_POLL_SIZE);

  let body;
  if (open.isPending || (needsClosed && closed.isPending)) body = <BriefingNote>{BRIEFING_LOADING_TEXT}</BriefingNote>;
  else if (open.isError) body = <BriefingNote tone="error">{BRIEFING_ERROR_TEXT}</BriefingNote>;
  else if (polls.length === 0) body = <BriefingNote>아직 올라온 투표가 없습니다</BriefingNote>;
  else {
    body = (
      <ul className="grid gap-4 p-5 lg:grid-cols-3">
        {polls.map((poll) => (
          <PollCard key={poll.id} poll={poll} dongName={dongName} onOpen={onOpen} />
        ))}
      </ul>
    );
  }

  return (
    <BriefingSection title="최근 투표" scope={dongName} onMore={onMore} className={className}>
      {body}
    </BriefingSection>
  );
};

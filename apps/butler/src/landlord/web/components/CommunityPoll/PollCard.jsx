import { DdayBadge } from './DdayBadge';
import { ScopeChip } from './ScopeChip';
import { VotedBadge } from './VotedBadge';

// 투표 목록의 카드: 범위 칩 + D-day / 제목 / 참여 N명 + 내 참여. 카드 전체가 눌린다.
// 참여 인원은 투표의 참여자 수다(머리말에 두지 않는 "커뮤니티 인원 수"와는 다르다).
export const PollCard = ({ poll, dongName, onOpen }) => (
  <li>
    <button
      type="button"
      onClick={() => onOpen(poll.id)}
      className="flex h-full w-full flex-col gap-2.5 rounded-card border border-line bg-surface p-5 text-left text-ink hover:bg-surface-2"
    >
      <span className="flex items-center justify-between gap-3">
        <ScopeChip scope={poll.scope} dongName={dongName} />
        <DdayBadge closesAt={poll.closesAt} isClosed={poll.isClosed} />
      </span>
      <h3 className="text-card font-semibold">{poll.title}</h3>
      <span className="flex items-center justify-between gap-3">
        <span className="text-sub leading-tight text-ink-3">
          참여 <span className="font-num font-medium tabular-nums">{poll.voteCount}</span>명
        </span>
        <VotedBadge hasVoted={poll.hasVoted} />
      </span>
    </button>
  </li>
);

import { Children } from 'react';
import { ExternalLink } from 'lucide-react';
import { AuthorName } from '../../../web/components/CommunityNickname/AuthorName';
import { DdayBadge } from '../../../web/components/CommunityPoll/DdayBadge';
import { ScopeChip } from '../../../web/components/CommunityPoll/ScopeChip';
import { VotedBadge } from '../../../web/components/CommunityPoll/VotedBadge';
import { getCategoryLabel } from '../../../web/utils/communityBoardLabels';
import { formatKstDate, formatKstShortDate } from '../../../web/utils/communityFormat';
import { formatDealAmount } from '../../../web/pages/CommunityMarketPage';
import { formatWon } from '../../../web/utils/communityMarketSummary';

// 앱 커뮤니티 목록 한 줄 — 브리핑 카드 안 · 게시판 · 뉴스 · 투표 목록이 같이 쓴다. 휴대폰 기준 규칙:
//   제목이 맨 위, 최대 2줄(넘치면 말줄임). 제목 칸은 폭을 다 쓰고(flex-1) 줄어들어 사라지지 않는다(data-row-title — 점검 스크립트가 본다)
//   그 아래 작은 글씨 한 줄(넘치면 줄을 바꾼다 — 자르지 않음): 분류 · 닉네임(괄호 표기 그대로) · 날짜 · [댓글 수] / 언론사 · 날짜 / 범위 · D-day · 참여 · 참여함
//   줄 전체가 눌리고 높이는 44px 이상. 문구 · 날짜 모양 · [댓글 수] 표기는 PC 와 같다(같은 utils · 같은 작은 부품)

const ROW = 'border-t border-line first:border-t-0';
const PRESSABLE = 'flex min-h-11 w-full text-left active:bg-surface-2';
const TITLE = 'line-clamp-2 break-words text-m-card font-semibold text-ink';
const META = 'flex flex-wrap items-center gap-x-1.5 gap-y-1 text-m-sub text-ink-3';

// 가운데 점(·)으로 잇는 짧은 정보 줄(목록 줄 아래 · 앱 머리). 점은 뒤 칸의 왼쪽 여백(pl-4)에 그리고, 칸이 줄을 바꿔 줄 맨 앞에 오면
// 그 여백이 왼쪽 바깥(-ml-4)으로 밀려 점만 잘린다 — 좁은 폭 · 긴 값에서 점이 줄 끝이나 줄 앞에 매달리지 않는다.
// 여러 줄로 꺾이는 긴 칸(괄호 표기)은 늘 줄 맨 앞에서 시작하므로(폭이 남지 않아) 글자는 잘리지 않는다. 빈 칸(null · false)은 건너뛴다.
export const DotLine = ({ className = '', children }) => (
  <span className={`block overflow-hidden ${className}`}>
    <span className="-ml-4 flex flex-wrap items-center gap-y-1">
      {Children.toArray(children).map((child) => (
        <span key={child.key} className="relative min-w-0 pl-4 before:absolute before:inset-y-0 before:left-0 before:flex before:w-4 before:items-center before:justify-center before:text-ink-3 before:content-['·']">
          {child}
        </span>
      ))}
    </span>
  </span>
);
const Num = ({ children }) => <span className="font-num tabular-nums">{children}</span>;

// 글 한 줄(브리핑 최근 게시글 · 게시판 목록)
export const AppPostRow = ({ post, onOpen }) => (
  <li className={ROW}>
    <button type="button" onClick={() => onOpen(post.id)} className={`${PRESSABLE} flex-col gap-1 px-4 py-3`}>
      <span data-row-title className={TITLE}>
        {post.title}
      </span>
      <DotLine className="text-m-sub text-ink-3">
        <span className="font-semibold text-ink-2">{getCategoryLabel(post.category)}</span>
        <AuthorName nickname={post.authorNickname} label={post.authorLabel} wrap />
        <span className="whitespace-nowrap">
          <Num>{formatKstShortDate(post.createdAt)}</Num>
          {post.commentCount > 0 && (
            <span className="ml-1.5 font-num font-semibold tabular-nums text-accent-strong" aria-label={`댓글 ${post.commentCount}개`}>
              [{post.commentCount}]
            </span>
          )}
        </span>
      </DotLine>
    </button>
  </li>
);

// 기사 한 줄(브리핑 최근 뉴스 · 뉴스 화면). 줄 전체가 원문 링크(새 창), 바깥 링크 표시는 오른쪽 끝.
// dateFormat: 'short'(브리핑 — MM-DD) | 'long'(뉴스 화면 — YYYY-MM-DD) — PC 각 화면과 같다. isComplex: 앞에 "우리 단지" 칩(브리핑)
export const AppNewsRow = ({ item, dateFormat = 'long', isComplex = false }) => (
  <li className={ROW}>
    <a href={item.url} target="_blank" rel="noopener noreferrer" className={`${PRESSABLE} items-start gap-3 px-4 py-3`}>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span data-row-title className={TITLE}>
          {item.title}
        </span>
        <span className="flex items-start gap-1.5">
          {isComplex && (
            <span className="flex-none rounded-chip bg-accent-soft px-2 py-0.5 text-m-chip font-semibold text-accent-strong">우리 단지</span>
          )}
          <DotLine className="min-w-0 flex-1 text-m-sub text-ink-3">
            {item.publisher && <span>{item.publisher}</span>}
            <Num>{dateFormat === 'short' ? formatKstShortDate(item.publishedAt) : formatKstDate(item.publishedAt)}</Num>
          </DotLine>
        </span>
      </span>
      <ExternalLink size={16} strokeWidth={2} aria-hidden="true" className="mt-1 flex-none text-ink-3" />
    </a>
  </li>
);

// 투표 한 줄(브리핑 최근 투표 · 투표 목록): 제목 / 범위 칩 · D-day · 참여 N명 · 참여함/미참여 — PC 투표 카드(PollCard)와 같은 정보
export const AppPollRow = ({ poll, dongName, onOpen }) => (
  <li className={ROW}>
    <button type="button" onClick={() => onOpen(poll.id)} className={`${PRESSABLE} flex-col gap-1.5 px-4 py-3`}>
      <span data-row-title className={TITLE}>
        {poll.title}
      </span>
      <span className={META}>
        <ScopeChip scope={poll.scope} dongName={dongName} />
        <DdayBadge closesAt={poll.closesAt} isClosed={poll.isClosed} />
        <span>
          참여 <Num>{poll.voteCount}</Num>명
        </span>
        <VotedBadge hasVoted={poll.hasVoted} />
      </span>
    </button>
  </li>
);

// 거래 한 줄(브리핑 최근 거래 · 시세 최근 거래): 왼쪽 날짜 · 전용 · 층, 오른쪽 금액. 누르는 줄이 아니다(PC 도 그렇다).
// dateFormat: 'short'(브리핑 — "MM-DD · 84㎡ · 8층") | 'long'(시세 — "YYYY-MM-DD · 전용 84㎡ · 8층") — PC 각 화면의 표기와 같다.
// 월세는 "보증금 … / 월 …" 을 두 줄로(PC 표와 같은 문구)
export const AppDealRow = ({ deal, dealType = 'SALE', dateFormat = 'long' }) => (
  <li className={`${ROW} flex min-h-11 items-center justify-between gap-3 px-4 py-2.5`}>
    <span className="min-w-0 font-num text-m-sub tabular-nums text-ink-2">
      {dateFormat === 'short'
        ? `${deal.contractDate.slice(5)} · ${Math.floor(deal.exclusiveArea)}㎡ · ${deal.floor}층`
        : `${deal.contractDate} · 전용 ${Math.floor(deal.exclusiveArea)}㎡ · ${deal.floor}층`}
    </span>
    <span className="flex-none text-right font-num text-num-body font-medium tabular-nums text-ink">
      {dealType === 'MONTHLY' ? (
        <>
          <span className="block whitespace-nowrap">보증금 {formatWon(deal.deposit)}</span>
          <span className="block whitespace-nowrap">월 {formatWon(deal.monthlyRent)}</span>
        </>
      ) : (
        <span className="whitespace-nowrap">{formatDealAmount(deal, dealType)}</span>
      )}
    </span>
  </li>
);

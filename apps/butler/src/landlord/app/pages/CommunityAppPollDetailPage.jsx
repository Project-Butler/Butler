import { Button } from '@butler/ui';
import { LoadingStatus } from '../../web/components/CommunityLayout/LoadingStatus';
import { AuthorName } from '../../web/components/CommunityNickname/AuthorName';
import { DdayBadge } from '../../web/components/CommunityPoll/DdayBadge';
import { PollDisclaimer } from '../../web/components/CommunityPoll/PollDisclaimer';
import { PollResults } from '../../web/components/CommunityPoll/PollResults';
import { ScopeChip } from '../../web/components/CommunityPoll/ScopeChip';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { OptionRadio, usePollDetailState } from '../../web/pages/CommunityPollDetailPage';
import { formatKstDateTime } from '../../web/utils/communityFormat';
import { getErrorMessage } from '../../web/utils/getErrorMessage';
import { AppNote } from '../components/CommunityApp/AppCard';
import { AppTextButton } from '../components/CommunityApp/AppControls';
import { AppLockedNotice } from '../components/CommunityApp/AppLockedNotice';
import { CommunityAppSubFrame } from '../components/CommunityApp/CommunityAppFrame';

// 앱 투표 상세 — PC 투표 상세(CommunityPollDetailPage)의 휴대폰 배치. 데이터 · 고르기 · 참여 · 지우기는 PC 와 같은 훅(usePollDetailState),
// 선택지 줄 · 결과 · 면책 문구도 PC 부품 그대로. 배치만: PC 의 두 칸(질문 | 오른쪽 자격 안내 카드) → 한 줄씩, 자격 안내 카드는 질문 아래.
// 마감 전에는 서버가 득표를 주지 않는다(결과는 마감 뒤에만) — PC 와 같은 규칙. [투표하기]는 폭 전체.
export const CommunityAppPollDetailPage = ({ pollId, frame, onBack }) => {
  const { poll, data, vote, removePoll, setSelected, selected, submit, deletePoll, eligibilityTarget, chosen } = usePollDetailState({
    pollId,
    onBack,
  });
  const num = (value) => <span className="font-num font-medium tabular-nums">{value}</span>;

  return (
    <CommunityAppSubFrame frame={frame} blockedReason={data?.writeBlockedReason ?? null}>
      {poll.isPending && <LoadingStatus />}
      {poll.isError && (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <AppNote tone="error">{getErrorMessage(poll.error)}</AppNote>
        </div>
      )}

      {data && (
        <>
          <section aria-label={data.title} className="space-y-4 rounded-card border border-line bg-surface p-4">
            <div className="space-y-2">
              <ScopeChip scope={data.scope} dongName={data.region.dongName} size="md" />
              <h2 className="break-words text-m-h1 font-semibold text-ink">{data.title}</h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-m-sub">
                <DdayBadge closesAt={data.closesAt} isClosed={data.isClosed} />
                <span className="text-ink-3">참여 {num(data.voteCount)}명</span>
                {data.authorLabel && <AuthorName nickname={data.authorNickname} label={data.authorLabel} wrap />}
              </div>
            </div>
            {data.description && <p className="whitespace-pre-wrap break-keep text-body leading-relaxed text-ink-2">{data.description}</p>}

            {data.locked ? null : data.isClosed ? (
              <div className="space-y-3">
                <PollResults options={data.options} voteCount={data.voteCount} weightTotal={data.weightTotal} myOptionId={data.myOptionId} myWeight={data.myWeight} />
                <div className="flex h-11 items-center justify-center rounded-btn border border-line bg-surface-2 text-m-label font-semibold text-ink-3">
                  마감된 투표입니다
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <fieldset className="flex flex-col gap-2">
                  <legend className="sr-only">선택지</legend>
                  {data.options.map((option) => (
                    <OptionRadio
                      key={option.id}
                      option={option}
                      checked={chosen === option.id}
                      disabled={!data.canVote || vote.isPending}
                      onChange={setSelected}
                    />
                  ))}
                </fieldset>
                {vote.isError && <NoticeBox>{getErrorMessage(vote.error)}</NoticeBox>}
                {data.canVote && <p className="text-m-sub text-ink-2">가진 표 {num(data.myWeight)}표를 한 선택지에 모두 반영합니다</p>}
                <Button size="h48" className="w-full" onClick={submit} disabled={!data.canVote || !selected || vote.isPending}>
                  {data.hasVoted ? (
                    <>
                      참여함 · <span className="font-num tabular-nums">{data.myWeight}</span>표
                    </>
                  ) : (
                    '투표하기'
                  )}
                </Button>
              </div>
            )}
          </section>

          {data.locked && (
            <AppLockedNotice description="권리자 인증을 마치면 선택지를 보고 투표에 참여할 수 있어요" onVerify={frame.verify} />
          )}

          {/* 자격 안내 — PC 오른쪽 칸 카드를 질문 아래로. 문구는 같다 */}
          <section aria-label="참여 안내" className="space-y-2 rounded-card border border-line bg-surface p-4">
            <p className="break-keep text-body text-ink">{eligibilityTarget} 임대인만 참여할 수 있는 투표입니다.</p>
            {!data.isClosed && !data.locked && !data.hasVoted && data.myUnitCount > 0 && (
              <p className="break-keep text-m-sub text-ink-2">
                인증한 호실 {num(data.myUnitCount)}개 — {num(data.myUnitCount)}표로 반영됩니다.
              </p>
            )}
            <p className="text-m-sub text-ink-2">
              <span className="font-num font-medium tabular-nums">{formatKstDateTime(data.closesAt)}</span> 마감
            </p>
            <div className="border-t border-line pt-2">
              <PollDisclaimer />
            </div>
          </section>

          {data.isMine && data.voteCount === 0 && (
            <div className="flex justify-end">
              <AppTextButton onClick={deletePoll} disabled={removePoll.isPending}>
                삭제
              </AppTextButton>
            </div>
          )}
          {removePoll.isError && <NoticeBox>{getErrorMessage(removePoll.error)}</NoticeBox>}
        </>
      )}
    </CommunityAppSubFrame>
  );
};

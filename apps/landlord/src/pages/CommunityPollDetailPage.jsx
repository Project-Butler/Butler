import { useState } from 'react';
import { Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useDeleteCommunityPoll } from '../hooks/useDeleteCommunityPoll';
import { useGetCommunityPoll } from '../hooks/useGetCommunityPoll';
import { usePostCommunityVote } from '../hooks/usePostCommunityVote';
import { getErrorMessage } from '../utils/getErrorMessage';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { LoadingStatus } from '../components/CommunityLayout/LoadingStatus';
import { LockedCard } from '../components/CommunityLayout/LockedCard';
import { DdayBadge } from '../components/CommunityPoll/DdayBadge';
import { ScopeChip } from '../components/CommunityPoll/ScopeChip';
import { PollDisclaimer } from '../components/CommunityPoll/PollDisclaimer';
import { PollResults } from '../components/CommunityPoll/PollResults';
import { formatKstDateTime } from '../utils/communityFormat';

// 선택지 한 줄: 원형 라디오 + 문구, 고르면 accent-soft 바탕 + accent 테두리.
const OptionRadio = ({ option, checked, disabled, onChange }) => (
  <label
    className={`flex h-[52px] items-center gap-3 rounded-btn border px-3.5 text-body font-medium text-ink ${
      checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
    } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 bg-surface ${
        checked ? 'border-accent' : 'border-line'
      }`}
    >
      {checked && <i className="block h-2.5 w-2.5 rounded-full bg-accent" />}
    </span>
    <input
      type="radio"
      name="community-poll-option"
      value={option.id}
      checked={checked}
      disabled={disabled}
      onChange={() => onChange(option.id)}
      className="sr-only"
    />
    <span>{option.label}</span>
  </label>
);

// 투표 상세 · 참여 화면.
// 두 칸: 왼쪽(col-span-2)에 질문 · 선택지 · [투표하기] 또는 결과(마감 뒤 득표 · 비율 막대), 오른쪽에 자격 안내 카드
// (참여 범위 · 1인 1표 · 마감 시각 · 면책 문구)와 그 아래 삭제(본인 · 참여 0명일 때만).
// 마감 전에는 서버가 득표를 주지 않는다. 참여했으면 내 선택을 보여 주고 버튼은 "참여함"으로 잠근다.
// 인증 전 미리보기(locked)면 서버가 선택지 · 내 참여 · 결과를 주지 않는다 — 질문 · 범위 · 마감 · 참여 인원 아래에 잠금 카드.
export const CommunityPollDetailPage = ({ pollId, frame, onBack }) => {
  const poll = useGetCommunityPoll(pollId);
  const vote = usePostCommunityVote();
  const removePoll = useDeleteCommunityPoll();
  const [selected, setSelected] = useState(null);
  const data = poll.data;

  const submit = async () => {
    try {
      await vote.mutateAsync({ pollId, optionId: selected });
    } catch {
      // 오류는 vote.error 로 아래에 보여 준다(이미 참여 409, 마감 409, 자격 403 포함)
    }
  };

  // 등록자 본인이고 참여자가 0명일 때만 지울 수 있다(서버가 같은 규칙으로 막는다).
  const deletePoll = async () => {
    if (!window.confirm('이 투표를 삭제할까요?')) return;
    try {
      await removePoll.mutateAsync(pollId);
      onBack();
    } catch {
      // 오류는 removePoll.error 로 아래에 보여 준다(그사이 누가 참여했으면 409)
    }
  };

  const eligibilityTarget = data?.scope === 'COMPLEX' ? data.complexName : data?.region.dongName;
  const chosen = data?.hasVoted ? data.myOptionId : selected;
  const num = (value) => <span className="font-num font-medium tabular-nums">{value}</span>;

  return (
    <CommunityFrame frame={frame} section="polls" blockedReason={data?.writeBlockedReason ?? null} onBack={onBack}>
      {poll.isPending && <LoadingStatus />}
      {poll.isError && <NoticeBox>{getErrorMessage(poll.error)}</NoticeBox>}

      {data && (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <Card className="space-y-5 p-6 lg:col-span-2">
            <div className="space-y-2">
              <ScopeChip scope={data.scope} dongName={data.region.dongName} size="md" />
              <h2 className="break-words text-section font-semibold text-ink">{data.title}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <DdayBadge closesAt={data.closesAt} isClosed={data.isClosed} />
                <span className="text-sub text-ink-3">참여 {num(data.voteCount)}명</span>
              </div>
            </div>
            {data.description && (
              <p className="whitespace-pre-wrap break-keep text-body leading-relaxed text-ink-2">{data.description}</p>
            )}

            {data.locked ? null : data.isClosed ? (
              <div className="space-y-3">
                <PollResults options={data.options} />
                <div className="flex h-11 items-center justify-center rounded-btn border border-line bg-surface-2 text-sub font-semibold text-ink-3">
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
                <div className="flex justify-end">
                  <Button onClick={submit} disabled={!data.canVote || !selected || vote.isPending}>
                    {data.hasVoted ? '참여함' : '투표하기'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
          {data.locked && (
            <div className="lg:col-span-2 lg:col-start-1">
              <LockedCard description="권리자 인증을 마치면 선택지를 보고 투표에 참여할 수 있어요" onVerify={frame.verify} />
            </div>
          )}

          <div className="space-y-3 lg:col-start-3 lg:row-start-1">
            <Card className="space-y-3 p-6">
              <p className="break-keep text-body text-ink">{eligibilityTarget} 임대인만 참여할 수 있는 투표입니다.</p>
              {!data.isClosed && !data.locked && (
                <p className="break-keep text-sub text-ink-2">
                  {num(1)}인 {num(1)}표입니다. 같은 범위에 여러 호실을 보유하셔도 한 표만 반영됩니다.
                  {data.myUnitCount >= 2 && (
                    <>
                      {' '}
                      {num(data.myUnitCount)}호실을 보유하고 계시지만 {num(1)}표만 반영됩니다.
                    </>
                  )}
                </p>
              )}
              <p className="text-sub text-ink-2">
                <span className="font-num font-medium tabular-nums">{formatKstDateTime(data.closesAt)}</span> 마감
              </p>
              <div className="border-t border-line pt-3">
                <PollDisclaimer />
              </div>
            </Card>
            {data.isMine && data.voteCount === 0 && (
              <button
                type="button"
                onClick={deletePoll}
                disabled={removePoll.isPending}
                className="inline-flex h-8 items-center text-label font-semibold text-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                삭제
              </button>
            )}
            {removePoll.isError && <NoticeBox>{getErrorMessage(removePoll.error)}</NoticeBox>}
          </div>
        </div>
      )}
    </CommunityFrame>
  );
};

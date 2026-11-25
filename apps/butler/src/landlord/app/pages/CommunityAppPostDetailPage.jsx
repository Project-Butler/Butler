import { Flag } from 'lucide-react';
import { Badge, Button, TextField } from '@butler/ui';
import { CategoryChip } from '../../web/components/CommunityBoard/CategoryChip';
import { ReportDialog } from '../../web/components/CommunityBoard/ReportDialog';
import { LoadingStatus } from '../../web/components/CommunityLayout/LoadingStatus';
import { AuthorName } from '../../web/components/CommunityNickname/AuthorName';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { usePostDetailState } from '../../web/pages/CommunityPostDetailPage';
import { getBlockedMessage } from '../../web/utils/communityBoardLabels';
import { formatKstDateTime } from '../../web/utils/communityFormat';
import { getErrorMessage } from '../../web/utils/getErrorMessage';
import { AppNote } from '../components/CommunityApp/AppCard';
import { AppTextButton } from '../components/CommunityApp/AppControls';
import { AppLockedNotice } from '../components/CommunityApp/AppLockedNotice';
import { CommunityAppSubFrame } from '../components/CommunityApp/CommunityAppFrame';

const MAX_COMMENT_LENGTH = 1000; // CommunityComment.body VarChar(1000) — PC 글 상세와 같다

// 앱 글 상세 — PC 글 상세(CommunityPostDetailPage)의 휴대폰 배치. 데이터 · 댓글 쓰기/지우기 · 글 지우기 · 신고 · 닉네임 확인은
// PC 와 같은 훅(usePostDetailState), 문구도 같다. 배치만:
//   제목(폭 전체, 줄을 바꾼다) → 분류 · 작성자 · 인증 완료 · 날짜(줄을 바꾼다) → 신고 · 수정 · 삭제(44px 글자 버튼) → 본문 카드 → 댓글 카드
//   PC 의 "제목 줄 오른쪽 작은 버튼"이 제목을 좁히지 않게 그 아래 줄로. 잠금(인증 전)은 작은 안내 카드. 신고는 아래 시트(같은 문구)
export const CommunityAppPostDetailPage = ({ postId, frame, building, onBack, onEdit }) => {
  const {
    post,
    data,
    canWrite,
    addComment,
    removeComment,
    removePost,
    draft,
    setDraft,
    isReportOpen,
    setIsReportOpen,
    isReported,
    setIsReported,
    actionError,
    submitComment,
    deleteComment,
    deletePost,
  } = usePostDetailState({ postId, frame, building, onBack });

  return (
    <CommunityAppSubFrame frame={frame} blockedReason={data?.writeBlockedReason ?? null}>
      {post.isPending && <LoadingStatus />}
      {post.isError && (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <AppNote tone="error">{getErrorMessage(post.error)}</AppNote>
        </div>
      )}

      {data && (
        <>
          <article className="space-y-3">
            <div className="space-y-2">
              <h2 className="break-words text-m-h1 font-semibold text-ink">{data.title}</h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-m-sub">
                <CategoryChip category={data.category} />
                <AuthorName nickname={data.authorNickname} label={data.authorLabel} wrap />
                <Badge tone="success" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <i aria-hidden="true" className="block h-1.5 w-1.5 rounded-full bg-ok" />
                  인증 완료
                </Badge>
                <span className="font-num font-medium tabular-nums text-ink-3">{formatKstDateTime(data.createdAt)}</span>
              </div>
              {(data.isMine || !data.locked) && (
                <div className="-my-1 flex justify-end gap-3">
                  {data.isMine ? (
                    <>
                      <AppTextButton onClick={() => onEdit(data)} disabled={!canWrite}>
                        수정
                      </AppTextButton>
                      <AppTextButton onClick={deletePost} disabled={removePost.isPending}>
                        삭제
                      </AppTextButton>
                    </>
                  ) : (
                    <AppTextButton onClick={() => setIsReportOpen(true)} disabled={!canWrite || isReported}>
                      <Flag size={16} strokeWidth={2} aria-hidden="true" />
                      신고
                    </AppTextButton>
                  )}
                </div>
              )}
            </div>
            {data.locked ? (
              <AppLockedNotice description="권리자 인증을 마치면 글 본문과 댓글을 볼 수 있어요" onVerify={frame.verify} />
            ) : (
              <div className="rounded-card border border-line bg-surface p-4">
                <p className="whitespace-pre-wrap break-words text-body leading-relaxed text-ink">{data.body}</p>
              </div>
            )}
          </article>

          {isReported && <NoticeBox tone="info">신고가 접수되었습니다.</NoticeBox>}
          {actionError && <NoticeBox>{actionError}</NoticeBox>}

          {!data.locked && (
            <section aria-labelledby="community-comments-title" className="overflow-hidden rounded-card border border-line bg-surface">
              <h2 id="community-comments-title" className="border-b border-line px-4 py-3 text-m-card font-semibold text-ink">
                댓글 <span className="font-num tabular-nums">{data.commentCount}</span>
              </h2>
              {data.comments.length > 0 && (
                <ul>
                  {data.comments.map((comment) => (
                    <li key={comment.id} className="space-y-1 border-b border-line px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 py-1 text-m-sub">
                          <AuthorName nickname={comment.authorNickname} label={comment.authorLabel} wrap />
                          <span className="whitespace-nowrap font-num font-medium tabular-nums text-ink-3">{formatKstDateTime(comment.createdAt)}</span>
                        </span>
                        {comment.isMine && (
                          <span className="-my-2.5 flex-none">
                            <AppTextButton onClick={() => deleteComment(comment.id)} disabled={removeComment.isPending}>
                              삭제
                            </AppTextButton>
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-body text-ink">{comment.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={submitComment} className="flex items-start gap-2 px-4 py-3 [&_.rounded-input>input]:min-h-11">
                <TextField
                  className="min-w-0 flex-1"
                  aria-label="댓글"
                  placeholder="댓글을 입력하세요"
                  maxLength={MAX_COMMENT_LENGTH}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={!canWrite || addComment.isPending}
                  hint={canWrite ? undefined : getBlockedMessage(data.writeBlockedReason)}
                />
                <Button type="submit" size="h48" className="flex-none" disabled={!canWrite || !draft.trim() || addComment.isPending}>
                  등록
                </Button>
              </form>
            </section>
          )}
        </>
      )}

      {isReportOpen && (
        <ReportDialog
          postId={postId}
          onClose={() => setIsReportOpen(false)}
          onDone={() => {
            setIsReportOpen(false);
            setIsReported(true);
          }}
        />
      )}
    </CommunityAppSubFrame>
  );
};

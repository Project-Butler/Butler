import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Badge, Button, Card, TextField } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useDeleteCommunityComment } from '../hooks/useDeleteCommunityComment';
import { useDeleteCommunityPost } from '../hooks/useDeleteCommunityPost';
import { useGetCommunityPost } from '../hooks/useGetCommunityPost';
import { usePostCommunityComment } from '../hooks/usePostCommunityComment';
import { getErrorMessage } from '../utils/getErrorMessage';
import { CategoryChip } from '../components/CommunityBoard/CategoryChip';
import { ReportDialog } from '../components/CommunityBoard/ReportDialog';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { LoadingStatus } from '../components/CommunityLayout/LoadingStatus';
import { LockedCard } from '../components/CommunityLayout/LockedCard';
import { getBlockedMessage } from '../utils/communityBoardLabels';
import { formatKstDateTime } from '../utils/communityFormat';

const MAX_COMMENT_LENGTH = 1000; // CommunityComment.body VarChar(1000)

// 작은 글자 버튼(글 상세의 "신고" 모양). 내 글이면 같은 모양으로 "수정"·"삭제".
const TextButton = ({ children, ...props }) => (
  <button
    type="button"
    className="inline-flex h-8 items-center gap-1.5 text-label font-semibold text-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-ink-3"
    {...props}
  >
    {children}
  </button>
);

// 글 상세 화면(max-w-3xl).
// 제목 → 분류 · 작성자 · 작성일 → 본문 카드, 제목 줄 오른쪽에 작은 글자 버튼(내 글: 수정 · 삭제 / 남의 글: 신고).
// 댓글은 아래 별도 카드(목록 + 맨 아래 입력칸). 작성자 옆 '인증 완료'는 글쓴이 표기다 — 글은 인증을 마친 임대인만 쓴다.
// 머리의 배지는 보는 사람의 이 법정동 자격(writeBlockedReason)이다. 자격이 없어도 내 글·댓글 삭제는 된다(수정은 안 됨).
// 인증 전 미리보기(locked)면 서버가 본문 · 댓글을 주지 않는다 — 제목 · 분류 · 작성자 · 날짜 아래에 잠금 카드, 신고 · 댓글 없음.
export const CommunityPostDetailPage = ({ postId, frame, building, onBack, onEdit }) => {
  const post = useGetCommunityPost(postId);
  const addComment = usePostCommunityComment();
  const removeComment = useDeleteCommunityComment();
  const removePost = useDeleteCommunityPost();
  const [draft, setDraft] = useState('');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isReported, setIsReported] = useState(false);
  const [actionError, setActionError] = useState('');

  const data = post.data;
  const canWrite = data?.canWrite ?? false;

  const submitComment = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setActionError('');
    try {
      await addComment.mutateAsync({ postId, complexId: building.complexId, body });
      setDraft('');
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm('이 댓글을 삭제할까요?')) return;
    setActionError('');
    try {
      await removeComment.mutateAsync({ commentId, postId });
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const deletePost = async () => {
    if (!window.confirm('이 글을 삭제할까요?')) return;
    setActionError('');
    try {
      await removePost.mutateAsync(postId);
      onBack();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  return (
    <CommunityFrame frame={frame} section="board" blockedReason={data?.writeBlockedReason ?? null} onBack={onBack} narrow>
      {post.isPending && <LoadingStatus />}
      {post.isError && <NoticeBox>{getErrorMessage(post.error)}</NoticeBox>}

      {data && (
        <>
          <article className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <h2 className="min-w-0 break-words text-section font-semibold text-ink">{data.title}</h2>
                <div className="flex flex-none gap-4">
                  {data.isMine ? (
                    <>
                      <TextButton onClick={() => onEdit(data)} disabled={!canWrite}>
                        수정
                      </TextButton>
                      <TextButton onClick={deletePost} disabled={removePost.isPending}>
                        삭제
                      </TextButton>
                    </>
                  ) : data.locked ? null : (
                    <TextButton onClick={() => setIsReportOpen(true)} disabled={!canWrite || isReported}>
                      <Flag size={16} strokeWidth={2} aria-hidden="true" />
                      신고
                    </TextButton>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryChip category={data.category} />
                <span className="text-label font-semibold text-ink-2">{data.authorLabel}</span>
                <Badge tone="success" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <i aria-hidden="true" className="block h-1.5 w-1.5 rounded-full bg-ok" />
                  인증 완료
                </Badge>
                <span className="font-num text-sub font-medium tabular-nums text-ink-3">{formatKstDateTime(data.createdAt)}</span>
              </div>
            </div>
            {data.locked ? (
              <LockedCard description="권리자 인증을 마치면 글 본문과 댓글을 볼 수 있어요" onVerify={frame.verify} />
            ) : (
              <Card className="p-6">
                <p className="whitespace-pre-wrap break-words text-body leading-relaxed text-ink">{data.body}</p>
              </Card>
            )}
          </article>

          {isReported && <NoticeBox tone="info">신고가 접수되었습니다.</NoticeBox>}
          {actionError && <NoticeBox>{actionError}</NoticeBox>}

          {!data.locked && (
          <Card className="p-6">
            <section aria-labelledby="community-comments-title" className="space-y-3">
              <h2 id="community-comments-title" className="text-section font-semibold text-ink">
                댓글 <span className="font-num tabular-nums">{data.commentCount}</span>
              </h2>
              {data.comments.length > 0 && (
                <ul>
                  {data.comments.map((comment) => (
                    <li key={comment.id} className="border-t border-line py-3 first:border-t-0 first:pt-0">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="text-label font-semibold text-ink-2">{comment.authorLabel}</span>
                        <span className="font-num text-sub font-medium tabular-nums text-ink-3">
                          {formatKstDateTime(comment.createdAt)}
                        </span>
                        {comment.isMine && (
                          <span className="ml-auto">
                            <TextButton onClick={() => deleteComment(comment.id)} disabled={removeComment.isPending}>
                              삭제
                            </TextButton>
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-body text-ink">{comment.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={submitComment} className="flex items-start gap-2 border-t border-line pt-4">
                <TextField
                  className="flex-1"
                  aria-label="댓글"
                  placeholder="댓글을 입력하세요"
                  maxLength={MAX_COMMENT_LENGTH}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={!canWrite || addComment.isPending}
                  hint={canWrite ? undefined : getBlockedMessage(data.writeBlockedReason)}
                />
                <Button type="submit" className="h-12 flex-none" disabled={!canWrite || !draft.trim() || addComment.isPending}>
                  등록
                </Button>
              </form>
            </section>
          </Card>
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
    </CommunityFrame>
  );
};

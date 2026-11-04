import { useState } from 'react';
import { Button, Card, TextField } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { usePatchCommunityPost } from '../hooks/usePatchCommunityPost';
import { usePostCommunityPost } from '../hooks/usePostCommunityPost';
import { toApiError, toFieldErrors } from '../utils/apiError';
import { POST_CATEGORIES } from '../utils/communityBoardLabels';
import { ChipGroup } from '../components/CommunityBoard/ChipGroup';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';

const MAX_TITLE_LENGTH = 100; // CommunityPost.title VarChar(100)
const MAX_BODY_LENGTH = 5000; // 서버 검증과 같은 값

// 글쓰기 · 수정 화면(max-w-3xl). 전용 디자인이 없어 이미 있는 것을 조합했다:
// 폼은 BuildingEditPage 처럼 Card 안, 분류는 게시판 분류 칩, 제목은 @butler/ui TextField, 내용은 BuildingEditPage 의 설명 칸 모양,
// 버튼은 폼 아래 오른쪽 [취소] [등록](A팀 관행), 오류는 NoticeBox.
// 떠날 때 입력 확인은 두지 않는다.
// post 가 있으면 수정 — 작성자 표기는 서버가 바꾸지 않는다.
export const CommunityPostWritePage = ({ frame, building, post = null, defaultCategory, onBack, onSaved }) => {
  const create = usePostCommunityPost();
  const patch = usePatchCommunityPost();
  const [draft, setDraft] = useState({
    category: post?.category ?? defaultCategory ?? POST_CATEGORIES[0].value,
    title: post?.title ?? '',
    body: post?.body ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState('');

  const mutation = post ? patch : create;
  const updateField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!draft.title.trim()) nextErrors.title = '제목을 입력해 주세요.';
    if (!draft.body.trim()) nextErrors.body = '내용을 입력해 주세요.';
    setFieldErrors(nextErrors);
    setErrorMessage('');
    if (Object.keys(nextErrors).length > 0) return;

    const fields = { category: draft.category, title: draft.title.trim(), body: draft.body.trim() };
    try {
      const saved = post
        ? await patch.mutateAsync({ postId: post.id, ...fields })
        : await create.mutateAsync({ legalDongCode: building.legalDongCode, complexId: building.complexId, ...fields });
      onSaved(saved);
    } catch (error) {
      const apiError = toApiError(error);
      setFieldErrors(toFieldErrors(apiError));
      setErrorMessage(apiError.message);
    }
  };

  return (
    <CommunityFrame frame={frame} section="board" onBack={onBack} narrow>
      <form onSubmit={submit} noValidate>
        <Card className="space-y-6 p-6">
          <h2 className="text-section font-semibold text-ink">{post ? '글 수정' : '글쓰기'}</h2>
          <div className="flex flex-col gap-1.5">
            <span className="text-label font-semibold text-ink">분류</span>
            <ChipGroup
              label="분류"
              options={POST_CATEGORIES}
              value={draft.category}
              onChange={(value) => updateField('category', value)}
              disabled={mutation.isPending}
              wrap
            />
          </div>
          <TextField
            label="제목"
            required
            maxLength={MAX_TITLE_LENGTH}
            value={draft.title}
            onChange={(event) => updateField('title', event.target.value)}
            error={fieldErrors.title}
            disabled={mutation.isPending}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="community-post-body" className="text-label font-semibold text-ink">
              내용
            </label>
            <textarea
              id="community-post-body"
              rows={10}
              maxLength={MAX_BODY_LENGTH}
              value={draft.body}
              onChange={(event) => updateField('body', event.target.value)}
              disabled={mutation.isPending}
              aria-invalid={fieldErrors.body ? true : undefined}
              className={`rounded-input border px-4 py-3 text-card text-ink outline-none focus:border-accent ${
                fieldErrors.body ? 'border-crit' : 'border-line'
              }`}
            />
            {fieldErrors.body && <p className="text-chip text-crit-ink">{fieldErrors.body}</p>}
          </div>

          {errorMessage && <NoticeBox>{errorMessage}</NoticeBox>}

          <div className="flex justify-end gap-3 border-t border-line pt-5">
            <Button variant="secondary" onClick={onBack} disabled={mutation.isPending}>
              취소
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {post ? '수정' : '등록'}
            </Button>
          </div>
        </Card>
      </form>
    </CommunityFrame>
  );
};

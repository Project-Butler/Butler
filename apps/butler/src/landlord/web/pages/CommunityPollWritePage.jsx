import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Card, TextField } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetCommunityPollList } from '../hooks/useGetCommunityPollList';
import { usePostCommunityPoll } from '../hooks/usePostCommunityPoll';
import { toApiError, toFieldErrors } from '../../../shared/apiError';
import { ChipGroup } from '../components/CommunityBoard/ChipGroup';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { formatKstDate } from '../utils/communityFormat';

const MAX_TITLE_LENGTH = 100; // CommunityPoll.title VarChar(100)
const MAX_DESCRIPTION_LENGTH = 1000; // 서버 검증과 같은 값
const MAX_OPTION_LENGTH = 80; // CommunityPollOption.label VarChar(80)
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const MAX_POLL_DAYS = 90;

const kstDateAfter = (days) => formatKstDate(new Date(Date.now() + days * 86400000).toISOString());

// 투표 만들기 화면(max-w-3xl). 전용 디자인이 없어 글쓰기 화면처럼 이미 있는 것을 조합했다:
// 폼은 Card 안(제목 "투표 만들기" = 투표 목록의 버튼 이름), 범위는 게시판 분류 칩(우리 단지 / 법정동 — 고르지 않은 채로 시작),
// 제목·선택지·마감일은 @butler/ui TextField, 설명은 글쓰기 화면의 내용 칸, 선택지 빼기는 신고 창의 닫기(×) 버튼 모양,
// "선택지 추가"는 Button secondary, 폼 아래 오른쪽 [취소] [등록](A팀 관행), 오류는 NoticeBox + 칸 아래 빨간 글자.
// 범위는 등록 뒤 바꿀 수 없다(참여 자격이 도중에 바뀌면 이미 던진 표의 자격이 사라진다) — 그래서 기본값 없이 직접 고르게 하고 그 사실을 칸 아래에 적는다.
export const CommunityPollWritePage = ({ frame, building, onBack, onSaved }) => {
  const create = usePostCommunityPoll();
  // 범위 칩에 쓸 법정동 이름. 목록에서 들어왔으면 캐시에 있다.
  const list = useGetCommunityPollList({ legalDongCode: building.legalDongCode, status: 'OPEN', complexId: building.complexId });
  const dongName = list.data?.pages[0]?.meta.region.dongName ?? '법정동';

  const [draft, setDraft] = useState({ scope: null, title: '', description: '', options: ['', ''], closesOn: kstDateAfter(7) });
  const [fieldErrors, setFieldErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const updateField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const updateOption = (index, value) =>
    setDraft((current) => ({ ...current, options: current.options.map((label, i) => (i === index ? value : label)) }));
  const removeOption = (index) =>
    setDraft((current) => ({ ...current, options: current.options.filter((_label, i) => i !== index) }));

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!draft.scope) nextErrors.scope = '범위를 골라 주세요.';
    if (!draft.title.trim()) nextErrors.title = '제목을 입력해 주세요.';
    if (draft.options.some((label) => !label.trim())) nextErrors.options = '선택지를 모두 입력해 주세요.';
    if (!draft.closesOn) nextErrors.closesOn = '마감일을 골라 주세요.';
    setFieldErrors(nextErrors);
    setErrorMessage('');
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const saved = await create.mutateAsync({
        legalDongCode: building.legalDongCode,
        complexId: building.complexId,
        scope: draft.scope,
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        options: draft.options.map((label) => label.trim()),
        closesOn: draft.closesOn,
      });
      onSaved(saved);
    } catch (error) {
      const apiError = toApiError(error);
      setFieldErrors(toFieldErrors(apiError));
      setErrorMessage(apiError.message);
    }
  };

  const isBusy = create.isPending;

  return (
    <CommunityFrame frame={frame} section="polls" onBack={onBack} narrow>
      <form onSubmit={submit} noValidate>
        <Card className="space-y-6 p-6">
          <h2 className="text-section font-semibold text-ink">투표 만들기</h2>
          <div className="flex flex-col gap-1.5">
            <span className="text-label font-semibold text-ink">범위</span>
            <ChipGroup
              label="투표 범위"
              options={[
                { value: 'COMPLEX', label: '우리 단지' },
                { value: 'REGION', label: dongName },
              ]}
              value={draft.scope}
              onChange={(value) => updateField('scope', value)}
              disabled={isBusy}
              wrap
            />
            {fieldErrors.scope ? (
              <p className="text-chip text-crit-ink">{fieldErrors.scope}</p>
            ) : (
              <p className="text-chip text-ink-3">
                {draft.scope === 'COMPLEX' ? `${building.name} 임대인만 참여합니다. ` : ''}
                {draft.scope === 'REGION' ? `${dongName} 임대인 모두 참여합니다. ` : ''}
                등록한 뒤에는 범위를 바꿀 수 없습니다.
              </p>
            )}
          </div>

          <TextField
            label="제목"
            required
            maxLength={MAX_TITLE_LENGTH}
            value={draft.title}
            onChange={(event) => updateField('title', event.target.value)}
            error={fieldErrors.title}
            disabled={isBusy}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="community-poll-description" className="text-label font-semibold text-ink">
              설명 (선택)
            </label>
            <textarea
              id="community-poll-description"
              rows={4}
              maxLength={MAX_DESCRIPTION_LENGTH}
              value={draft.description}
              onChange={(event) => updateField('description', event.target.value)}
              disabled={isBusy}
              className="rounded-input border border-line px-4 py-3 text-card text-ink outline-none focus:border-accent"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-label font-semibold text-ink">선택지</legend>
            {draft.options.map((label, index) => (
              <div key={index} className="flex items-end gap-1">
                <TextField
                  className="flex-1"
                  aria-label={`선택지 ${index + 1}`}
                  placeholder={`선택지 ${index + 1}`}
                  maxLength={MAX_OPTION_LENGTH}
                  value={label}
                  onChange={(event) => updateOption(index, event.target.value)}
                  disabled={isBusy}
                />
                {draft.options.length > MIN_OPTIONS && (
                  <button
                    type="button"
                    aria-label={`선택지 ${index + 1} 빼기`}
                    onClick={() => removeOption(index)}
                    disabled={isBusy}
                    className="flex h-12 w-11 flex-none items-center justify-center rounded-input text-ink-2 hover:bg-surface-2 hover:text-ink"
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {fieldErrors.options && <p className="text-chip text-crit-ink">{fieldErrors.options}</p>}
            {draft.options.length < MAX_OPTIONS && (
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => updateField('options', [...draft.options, ''])}
                disabled={isBusy}
              >
                선택지 추가
              </Button>
            )}
          </fieldset>

          <TextField
            label="마감일"
            required
            type="date"
            min={kstDateAfter(0)}
            max={kstDateAfter(MAX_POLL_DAYS)}
            value={draft.closesOn}
            onChange={(event) => updateField('closesOn', event.target.value)}
            error={fieldErrors.closesOn}
            hint="그날 23:59에 마감됩니다."
            disabled={isBusy}
          />

          {errorMessage && <NoticeBox>{errorMessage}</NoticeBox>}

          <div className="flex justify-end gap-3 border-t border-line pt-5">
            <Button variant="secondary" onClick={onBack} disabled={isBusy}>
              취소
            </Button>
            <Button type="submit" disabled={isBusy}>
              등록
            </Button>
          </div>
        </Card>
      </form>
    </CommunityFrame>
  );
};

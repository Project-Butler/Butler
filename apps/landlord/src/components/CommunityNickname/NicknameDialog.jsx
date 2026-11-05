import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button, TextField } from '@butler/ui';
import { usePutCommunityProfile } from '../../hooks/usePutCommunityProfile';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatKstDate } from '../../utils/communityFormat';
import { AuthorName } from './AuthorName';

const MAX_NICKNAME_LENGTH = 12; // 서버 nicknameRules.js NICKNAME_MAX_LENGTH
const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

// 닉네임 정하기 대화상자(PC 명세 10절). 신고 대화상자와 같은 틀 — 어두운 덮개 + 가운데 카드(max-w-md),
// Esc · 바깥 클릭으로 닫기, 포커스 가둠(열면 입력 칸, 닫으면 열기 전 자리로).
// 규칙(2~12자 · 한글 · 영문 · 숫자 · 금지 낱말 · 30일)은 서버가 본다 — 화면은 서버 오류 문구를 칸 아래 한 줄로 보여 준다.
// profile: { nickname, nextChangeAt, previewLabel } (없으면 아직 못 불러온 것) · onSaved: 저장한 뒤(하던 일로 돌아가기) · onClose: 닫기
export const NicknameDialog = ({ complexId, profile, onSaved, onClose }) => {
  const save = usePutCommunityProfile();
  const [value, setValue] = useState(profile?.nickname ?? '');
  const dialogRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.querySelector(FOCUSABLE)?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusables = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const trimmed = value.trim();
  const current = profile?.nickname ?? null;
  // 바꾼 지 30일이 안 됐으면 서버가 다음 가능일을 준다 — 지금 닉네임은 그대로 두고 저장만 막는다
  const lockedUntil = current && profile?.nextChangeAt ? formatKstDate(profile.nextChangeAt) : null;
  const canSave = trimmed.length > 0 && trimmed !== current && !lockedUntil && !save.isPending;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    try {
      await save.mutateAsync({ nickname: trimmed, complexId });
      onSaved();
    } catch {
      // 오류는 save.error 로 칸 아래에 보여 준다(형식 · 금지 낱말 · 이미 쓰는 닉네임 · 아직 바꿀 수 없음)
    }
  };

  const error = save.isError ? getErrorMessage(save.error) : lockedUntil ? `${lockedUntil}부터 바꿀 수 있어요` : undefined;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-nickname-title"
        aria-describedby="community-nickname-description"
        className="flex w-full max-w-md flex-col gap-4 rounded-card bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="community-nickname-title" className="text-section font-semibold text-ink">
            커뮤니티 닉네임
          </h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="-mr-3 flex h-11 w-11 items-center justify-center rounded-input text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <p id="community-nickname-description" className="-mt-2 text-body text-ink-2">
          {"글과 댓글에 '닉네임 (단지명 동 임대인)' 으로 보입니다"}
        </p>

        <div className="flex flex-col gap-2">
          <TextField
            label="닉네임"
            value={value}
            maxLength={MAX_NICKNAME_LENGTH}
            placeholder="2~12자"
            onChange={(event) => {
              setValue(event.target.value);
              if (save.isError) save.reset();
            }}
            error={error}
          />
          {profile?.previewLabel && (
            <p className="flex min-w-0 items-baseline gap-2 text-sub text-ink-3">
              <span className="flex-none">미리보기</span>
              <AuthorName nickname={trimmed || '닉네임'} label={profile.previewLabel} />
            </p>
          )}
          <p className="text-sub text-ink-3">2~12자 · 한글 · 영문 · 숫자 · 30일에 한 번 바꿀 수 있어요</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={!canSave}>
            저장
          </Button>
        </div>
      </form>
    </div>
  );
};

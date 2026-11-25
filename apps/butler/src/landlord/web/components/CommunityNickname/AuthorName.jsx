// 작성자 칸(PC 명세 5절 v3): "닉네임 (괄호 표기)". 닉네임은 본문 글자 ink 600, 괄호 부분은 작은 글자 ink-3.
// 칸이 좁으면 괄호 부분만 말줄임(닉네임은 자르지 않음). 닉네임이 없는 옛 글은 괄호 없이 표기만(지금까지의 모양).
// 글 목록 · 글 상세 · 댓글 · 투표 상세 · 닉네임 대화상자의 미리보기 줄이 같이 쓴다.
// wrap: 좁은 화면(앱 목록 한 줄)에서 자르지 않고 줄을 바꾼다 — 글자는 같다(기본 false — PC 는 지금 그대로)
export const AuthorName = ({ nickname, label, className = '', wrap = false }) => {
  if (wrap) {
    return nickname ? (
      <span className={`min-w-0 break-words ${className}`}>
        <span className="font-semibold text-ink-2">{nickname}</span>
        {label && <span className="text-ink-3"> ({label})</span>}
      </span>
    ) : (
      <span className={`min-w-0 break-words font-semibold text-ink-2 ${className}`}>{label}</span>
    );
  }
  return nickname ? (
    <span className={`inline-flex min-w-0 max-w-full items-baseline gap-1 ${className}`}>
      <span className="flex-none whitespace-nowrap text-body font-semibold text-ink">{nickname}</span>
      {label && <span className="min-w-0 truncate text-sub text-ink-3">({label})</span>}
    </span>
  ) : (
    <span className={`inline-block min-w-0 max-w-full truncate align-bottom text-label font-semibold text-ink-2 ${className}`}>{label}</span>
  );
};

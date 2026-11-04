// 게시판 목록의 "내 글" 토글. 디자인에 꺼진 모양만 있어 켜진 모양은 accent 바탕 + 손잡이 오른쪽으로만 바꾼다.
export const MineToggle = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label="내 글 보기"
    onClick={() => onChange(!checked)}
    className="flex h-8 flex-none items-center gap-1.5 whitespace-nowrap border-l border-line pl-2.5 pr-1 text-chip font-semibold text-ink-3"
  >
    <span>내 글</span>
    <i
      aria-hidden="true"
      className={`relative block h-5 w-[34px] rounded-full border ${checked ? 'border-accent bg-accent' : 'border-line bg-surface-2'}`}
    >
      <i
        className={`absolute top-0.5 block h-3.5 w-3.5 rounded-full border border-line bg-surface transition-[left] ${
          checked ? 'left-[16px]' : 'left-0.5'
        }`}
      />
    </i>
  </button>
);

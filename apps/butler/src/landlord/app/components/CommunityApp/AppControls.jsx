import { Button } from '@butler/ui';

// 앱 커뮤니티 조작 부품 — PC 부품(ChipGroup · Segment · MineToggle · 글쓰기 버튼 · 글자 버튼)과 같은 문구 · 같은 역할(role),
// 휴대폰에서 누르기 좋게 높이 44px(min-h-11) · 앱 글자 크기(text-m-*)만 다르다. 창 폭에 따라 바뀌는 클래스(sm:/lg:)는 쓰지 않는다.

// 하나만 고르는 칩 줄(게시판 분류 · 투표 범위 · 시세 면적대). 넘치면 줄을 바꾼다(가로 스크롤 없음).
// 켜진 칩은 accent-soft(PC 칩과 같은 색). dotKeys: 칩 앞에 작은 점(시세 "내 호실이 있는 면적대")
export const AppChipGroup = ({ label, options, value, onChange, dotKeys }) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((option) => {
      const isActive = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={isActive}
          onClick={() => onChange(option.value)}
          className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-m-label font-semibold ${
            isActive ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface text-ink-2'
          }`}
        >
          {dotKeys?.has(option.value) && (
            <i aria-label="내 호실" className={`block h-1 w-1 flex-none rounded-full ${isActive ? 'bg-accent-strong' : 'bg-accent'}`} />
          )}
          {option.label}
        </button>
      );
    })}
  </div>
);

// 두세 칸 중 하나(시세 거래 유형 · 투표 진행중/마감) — PC Segment 와 같은 모양, 칸 높이 44px · 폭 전체를 나눈다
export const AppSegment = ({ label, options, value, onChange }) => (
  <div role="radiogroup" aria-label={label} className="flex rounded-btn border border-line bg-surface-2 p-1">
    {options.map((option) => {
      const isActive = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={isActive}
          onClick={() => onChange(option.value)}
          className={`flex min-h-11 flex-1 items-center justify-center rounded-[9px] text-m-label font-semibold ${
            isActive ? 'border border-line bg-surface text-ink' : 'text-ink-3'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

// 게시판 "내 글" 토글 — PC MineToggle 과 같은 이름 · 같은 모양(손잡이), 누르는 곳 44px
export const AppMineToggle = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label="내 글 보기"
    onClick={() => onChange(!checked)}
    className="flex min-h-11 flex-none items-center gap-2 whitespace-nowrap px-1 text-m-label font-semibold text-ink-2"
  >
    <span>내 글</span>
    <i aria-hidden="true" className={`relative block h-5 w-[34px] rounded-full border ${checked ? 'border-accent bg-accent' : 'border-line bg-surface-2'}`}>
      <i
        className={`absolute top-0.5 block h-3.5 w-3.5 rounded-full border border-line bg-surface transition-[left] ${checked ? 'left-[16px]' : 'left-0.5'}`}
      />
    </i>
  </button>
);

// 하단 탭 위 오른쪽에 떠 있는 버튼([글쓰기] · [투표 만들기]). 문구 · 막힘 조건은 PC 와 같다.
// 하단 탭(약 66px) 위로 16px, 모바일 폭(430px) 틀 안 오른쪽. 목록 끝이 가리지 않게 화면 틀(CommunityAppFrame)이 아래를 비운다.
export const AppFloatingButton = ({ icon: Icon, label, onClick, disabled }) => (
  <div className="pointer-events-none fixed inset-x-0 bottom-[82px] z-20 mx-auto flex w-full max-w-[430px] justify-end px-5">
    <Button size="h48" className="pointer-events-auto inline-flex items-center !rounded-full" onClick={onClick} disabled={disabled}>
      <Icon size={18} className="-ml-0.5 mr-1.5" aria-hidden="true" />
      {label}
    </Button>
  </div>
);

// 작은 글자 버튼(글 상세의 신고 · 수정 · 삭제, 댓글 삭제) — PC TextButton 과 같은 모양, 누르는 곳 44px
export const AppTextButton = ({ children, ...props }) => (
  <button
    type="button"
    className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap px-1 text-m-label font-semibold text-ink-3 disabled:cursor-not-allowed disabled:opacity-50"
    {...props}
  >
    {children}
  </button>
);

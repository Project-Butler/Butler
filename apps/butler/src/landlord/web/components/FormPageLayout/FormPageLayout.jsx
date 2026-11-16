import { PageHeader } from '../PageHeader/PageHeader';

// 구역 폼 화면 틀(폼·위저드): 머리(제목·설명·[취소][주 버튼]) + 왼쪽 3칸 폼(위 안내 띠 · 구역들 · 아래 버튼 줄) + 오른쪽 1칸 요약.
// 주 버튼은 머리와 폼 아래 두 곳에 둔다(긴 폼에서 위·아래 어디서든 바로 저장). 아래 버튼 줄은 폼 안이라 Enter로도 제출된다.
// actions: 머리·아래에 같이 쓸 버튼 렌더 함수(place: 'header' | 'footer'), notice: 폼 위 안내 띠(선택), summary: 오른쪽 패널
// showRequiredHint: 필수 칸이 없는 화면(관리자 문의)은 false
export const FormPageLayout = ({ className = '', title, description, actions, notice, summary, onSubmit, showRequiredHint = true, children }) => (
  <div className={`${className} w-full space-y-5 pb-10`}>
    <PageHeader title={title} description={description} actions={actions('header')} />
    <div className="grid grid-cols-4 items-start gap-6">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="form-page__form-sections col-span-3 rounded-card border border-line bg-surface"
      >
        {notice}
        <div className="p-6">{children}</div>
        <div className="form-page__action-bar flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          {showRequiredHint && (
            <span className="mr-auto text-sub text-ink-3">
              <span className="text-crit">*</span> 표시는 꼭 입력해요
            </span>
          )}
          {actions('footer')}
        </div>
      </form>
      <aside className="form-page__summary-panel sticky top-6 space-y-4">{summary}</aside>
    </div>
  </div>
);

// 폼 위 안내 띠(수정 화면의 "진행 중 계약은 …" 등). tone: warn | info
const STRIP_TONE = { warn: 'bg-warn-soft text-warn-ink', info: 'bg-accent-soft text-accent-strong' };
export const FormNoticeStrip = ({ icon: Icon, tone = 'warn', children }) => (
  <div className={`flex items-center gap-2 rounded-t-card border-b border-line px-6 py-3 text-sub ${STRIP_TONE[tone]}`}>
    {Icon && <Icon size={15} className="shrink-0" aria-hidden="true" />}
    {children}
  </div>
);

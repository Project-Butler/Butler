// Created: 2026-11-25
import { Button } from '@butler/ui';

// 앱 부동산 상세 [기본 정보]의 카드 틀(호실 정보·임대 조건·내 소유 정보). 제목 + 오른쪽 [수정](onEdit 가 있을 때만) + 내용.
export const DetailCardFrame = ({ title, onEdit, children }) => (
  <section aria-label={title} className="rounded-card border border-line bg-surface px-4">
    <div className="flex items-center justify-between gap-3 pb-1 pt-3.5">
      <h3 className="text-card-sm font-semibold text-ink">{title}</h3>
      {onEdit && (
        <Button variant="secondary" size="sm" onClick={onEdit} aria-label={`${title} 수정`}>
          수정
        </Button>
      )}
    </div>
    {children}
  </section>
);

// 카드 안 한 줄(왼쪽 이름, 오른쪽 값). 값이 없으면 '—'. numeric 이면 숫자 글꼴, seal 이면 인증된 값을 뜻하는 남색 글자.
export const CardRow = ({ label, value, numeric = false, seal = false }) => (
  <div className="flex items-start justify-between gap-4 border-t border-line py-3">
    <dt className="shrink-0 text-m-label text-ink-3">{label}</dt>
    <dd className={`min-w-0 text-right text-body ${seal ? 'text-seal-ink' : 'text-ink'} ${numeric ? 'font-num tabular-nums' : ''}`}>
      {value ?? '—'}
    </dd>
  </div>
);

import { IconTile } from '../IconTile/IconTile';

// 구역 폼의 한 구역: 왼쪽(1칸) 아이콘 + 구역 이름·설명, 오른쪽(3칸) 입력. 구역 사이는 선으로 나눈다.
// 계약 등록·수정, 부동산 등록, 관리자 문의에서 같은 모양으로 쓴다.
export const FormSection = ({ icon, title, description, children }) => (
  <section className="form-section grid grid-cols-4 gap-6 border-b border-line py-6 first:pt-0 last:border-b-0 last:pb-0">
    <div className="flex items-start gap-3">
      <IconTile icon={icon} tone="mute" size="sm" />
      <div className="min-w-0">
        <p className="text-body font-semibold text-ink">{title}</p>
        {description && <p className="mt-0.5 break-keep text-sub text-ink-3">{description}</p>}
      </div>
    </div>
    <div className="col-span-3 space-y-4">{children}</div>
  </section>
);

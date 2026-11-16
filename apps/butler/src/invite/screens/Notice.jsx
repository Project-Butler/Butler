import { CircleAlert } from 'lucide-react';

// 화면 위쪽 안내(소셜 로그인 실패 문구 등).
export const Notice = ({ children }) => (
  <p role="alert" className="flex items-start gap-2 rounded-input bg-crit-box px-3 py-2.5 text-m-sub text-crit-ink">
    <CircleAlert size={16} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </p>
);

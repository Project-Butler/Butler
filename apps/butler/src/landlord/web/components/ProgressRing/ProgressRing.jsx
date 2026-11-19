// Created: 2026-11-19
// 끝을 알 수 없는 진행(권리자 인증 진행 중)을 보여 주는 도는 원형 링. 남색(seal)은 권리자 인증 진행에만 쓴다.
// 움직임 줄이기 설정이면 돌지 않는다. size: IconTile과 같은 단계(sm · md · lg)
// surface: 바탕 칸 색. 'soft'(기본, 흰 카드 위) · 'surface'(남색 연한 바탕 카드 위에서 링이 잘 보이게 흰 칸)
const SIZE_CLASS = { sm: 'h-9 w-9', md: 'h-10 w-10', lg: 'h-11 w-11' };
const SURFACE_CLASS = { soft: 'bg-seal-soft', surface: 'bg-surface' };
const RING_SIZE = { sm: 22, md: 26, lg: 28 };
const STROKE = 3;

export const ProgressRing = ({ size = 'md', surface = 'soft', label = '진행 중' }) => {
  const ring = RING_SIZE[size];
  const radius = (ring - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span role="status" aria-label={label} className={`flex shrink-0 items-center justify-center rounded-btn text-seal ${SURFACE_CLASS[surface]} ${SIZE_CLASS[size]}`}>
      <svg width={ring} height={ring} viewBox={`0 0 ${ring} ${ring}`} className="animate-spin motion-reduce:animate-none" aria-hidden="true">
        <circle cx={ring / 2} cy={ring / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth={STROKE} />
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.28} ${circumference}`}
        />
      </svg>
    </span>
  );
};

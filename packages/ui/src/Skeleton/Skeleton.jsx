// 본문을 불러오는 동안 보여 주는 뼈대. 실제 화면과 비슷한 크기로 자리를 잡아 두어, 데이터가 오면 모양이 바뀌지 않고 내용만 채워진다.
// 스크린 리더에는 label(기본 "불러오는 중입니다") 한 줄만 읽힌다. 움직임 줄이기를 켠 사용자에게는 깜빡이지 않는다.

const BLOCK = 'animate-pulse rounded-btn bg-line motion-reduce:animate-none';

// 한 덩어리. 크기·모양은 className(h-4 w-1/3 등)으로 정한다.
export const Skeleton = ({ className = '' }) => <div aria-hidden="true" className={`${BLOCK} ${className}`} />;

// 스켈레톤 묶음의 바깥. 읽기 전용 안내(label)와 aria-busy를 단다.
export const SkeletonStatus = ({ label = '불러오는 중입니다', className = '', children }) => (
  <div role="status" aria-busy="true" className={className}>
    <span className="sr-only">{label}</span>
    {children}
  </div>
);

const LINE_WIDTHS = ['w-full', 'w-11/12', 'w-4/5', 'w-9/12', 'w-2/3'];

// 글 줄. 줄마다 길이를 달리해 자연스럽게 보이게 한다.
export const SkeletonLines = ({ lines = 3, className = '' }) => (
  <div aria-hidden="true" className={`flex flex-col gap-2.5 ${className}`}>
    {Array.from({ length: lines }, (_, index) => (
      <div key={index} className={`h-3.5 ${BLOCK} ${LINE_WIDTHS[index % LINE_WIDTHS.length]}`} />
    ))}
  </div>
);

const CARD = 'rounded-card border border-line bg-surface';

// variant
// - list: 목록 행(계약·호실·기록). 제목 줄 + 보조 줄 + 오른쪽 값
// - cards: 카드 격자(건물·통계)
// - table: 머리글 + 표 행(서류함)
// - detail: 위쪽 요약 카드 + 아래 본문 카드(상세·수정 화면)
// - text: 글 몇 줄만(작은 영역·팝업 안)
export const PageSkeleton = ({ variant = 'list', rows = 5, label, className = '' }) => (
  <SkeletonStatus label={label} className={className}>
    {variant === 'list' && (
      <div aria-hidden="true" className={`${CARD} divide-y divide-line`}>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className={`h-4 w-1/3 ${BLOCK}`} />
              <div className={`h-3 w-1/2 ${BLOCK}`} />
            </div>
            <div className={`h-5 w-16 shrink-0 ${BLOCK}`} />
          </div>
        ))}
      </div>
    )}
    {variant === 'cards' && (
      <div aria-hidden="true" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={`${CARD} flex flex-col gap-3 p-5`}>
            <div className={`h-4 w-2/3 ${BLOCK}`} />
            <div className={`h-3 w-1/2 ${BLOCK}`} />
            <div className={`mt-2 h-8 w-1/3 ${BLOCK}`} />
          </div>
        ))}
      </div>
    )}
    {variant === 'table' && (
      <div aria-hidden="true" className={`${CARD} overflow-hidden`}>
        <div className="flex gap-4 border-b border-line bg-surface-2 px-5 py-3">
          <div className={`h-3 w-1/3 ${BLOCK}`} />
          <div className={`h-3 w-1/6 ${BLOCK}`} />
          <div className={`h-3 w-1/6 ${BLOCK}`} />
        </div>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0">
            <div className={`h-4 w-1/3 ${BLOCK}`} />
            <div className={`h-4 w-1/6 ${BLOCK}`} />
            <div className={`h-4 w-1/6 ${BLOCK}`} />
          </div>
        ))}
      </div>
    )}
    {variant === 'detail' && (
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className={`${CARD} flex flex-col gap-3 p-5`}>
          <div className={`h-5 w-1/3 ${BLOCK}`} />
          <div className={`h-3 w-1/2 ${BLOCK}`} />
          <div className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={`h-12 ${BLOCK}`} />
            ))}
          </div>
        </div>
        <div className={`${CARD} p-5`}>
          <SkeletonLines lines={Math.max(rows, 3)} />
        </div>
      </div>
    )}
    {variant === 'text' && <SkeletonLines lines={rows} />}
  </SkeletonStatus>
);

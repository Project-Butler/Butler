// 아래에서 올라오는 시트(완료 처리·취소 확인·문서 올리기). 바깥을 누르면 onClose.
export const BottomSheet = ({ label, onClose, children }) => (
  <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40" onClick={onClose}>
    <div className="flex max-h-[85vh] w-full max-w-[430px] flex-col gap-4 overflow-y-auto rounded-t-card bg-surface px-5 pb-7 pt-5" onClick={(event) => event.stopPropagation()}>
      <h2 className="text-m-card font-semibold text-ink">{label}</h2>
      {children}
    </div>
  </div>
);

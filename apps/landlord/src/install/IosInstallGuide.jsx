export const IosInstallGuide = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="max-w-sm rounded bg-white p-6 text-gray-900">
        <p className="mb-4">
          Safari 하단의 <strong>공유</strong> 버튼을 누른 뒤, <strong>홈 화면에 추가</strong>를 선택하면 앱처럼 설치할 수 있어요.
        </p>
        <button type="button" onClick={onClose} className="rounded bg-gray-900 px-3 py-1 text-white">
          닫기
        </button>
      </div>
    </div>
  );
};

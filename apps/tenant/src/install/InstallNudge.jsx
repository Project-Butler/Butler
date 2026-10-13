import { useInstallPrompt } from './useInstallPrompt';

export const InstallNudge = ({ show }) => {
  const { isInstallable, promptInstall } = useInstallPrompt();

  if (!show || !isInstallable) return null;

  return (
    <div role="status" className="flex items-center justify-between gap-4 rounded bg-gray-100 px-4 py-3 text-gray-900">
      <span>다음에는 더 빠르게 접속할 수 있어요. 버틀러를 설치해보세요.</span>
      <button type="button" onClick={promptInstall} className="rounded bg-gray-900 px-3 py-1 text-white">
        설치하기
      </button>
    </div>
  );
};

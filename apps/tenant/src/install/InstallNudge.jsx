import { useInstallPrompt } from './useInstallPrompt';

export const InstallNudge = ({ show }) => {
  const { isInstallable, promptInstall } = useInstallPrompt();

  if (!show || !isInstallable) return null;

  return (
    <div role="status" className="flex items-center justify-between gap-4 rounded bg-surface-2 px-4 py-3 text-ink">
      <span>다음에는 더 빠르게 접속할 수 있어요. 버틀러를 설치해보세요.</span>
      <button type="button" onClick={promptInstall} className="rounded bg-accent px-3 py-1 text-white">
        설치하기
      </button>
    </div>
  );
};

import { useInstallPrompt } from './useInstallPrompt';

export const InstallBanner = () => {
  const { isInstallable, promptInstall } = useInstallPrompt();

  if (!isInstallable) return null;

  return (
    <div role="banner" className="flex items-center justify-between gap-4 bg-gray-900 px-4 py-3 text-white">
      <span>버틀러를 앱으로 설치하고 더 빠르게 이용하세요.</span>
      <button type="button" onClick={promptInstall} className="rounded bg-white px-3 py-1 text-gray-900">
        앱으로 설치
      </button>
    </div>
  );
};

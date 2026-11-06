import { useState } from 'react';
import { Button } from '@butler/ui';
import { useInstallPrompt } from './useInstallPrompt';

export const InstallBanner = () => {
  const { isInstallable, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  if (!isInstallable || dismissed) return null;

  return (
    <div
      role="banner"
      className="mx-6 mt-4 flex items-center justify-between gap-4 rounded-card border border-line bg-surface px-4 py-3 text-body text-ink"
    >
      <span>홈 화면에 버틀러를 추가하면 알림을 바로 받을 수 있어요</span>
      <div className="flex items-center gap-2">
        <Button onClick={promptInstall}>앱으로 설치</Button>
        <button type="button" aria-label="닫기" onClick={() => setDismissed(true)} className="px-2 text-ink-3">
          ×
        </button>
      </div>
    </div>
  );
};

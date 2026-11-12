import { useEffect, useId, useState } from 'react';
import { Button } from '@butler/ui';
import { formatDday } from '../../utils/contract';
import { buildRenewalMessage } from '../../utils/ownershipVerification';

// 세션당 1회. 같은 탭에서 다른 계정으로 로그인하면 다시 띄운다. 저장소를 못 쓰면 이번 화면에서만 기억한다.
const toStorageKey = (userId) => `butler.renewalPopupShown.${userId}`;

const wasShown = (userId) => {
  try {
    return window.sessionStorage.getItem(toStorageKey(userId)) === '1';
  } catch {
    return false;
  }
};

const markShown = (userId) => {
  try {
    window.sessionStorage.setItem(toStorageKey(userId), '1');
  } catch {
    // 저장하지 못해도 안내는 그대로 보여 준다.
  }
};

// 종 아이콘 목록(알림 기능이 없어 재인증 대상만 계산해 보여 준다).
export const toRenewalNotifications = (notices, onNavigate) => ({
  emptyText: '새 알림이 없어요',
  footer: notices.length > 0 ? buildRenewalMessage(notices.some((notice) => notice.mentionsCommunity)) : undefined,
  items: notices.map((notice) => ({
    id: notice.id,
    title: notice.displayName,
    description: notice.isExpired ? `인증 만료 · ${notice.expiresOn}` : `인증 만료 예정 · ${notice.expiresOn}`,
    badge: notice.isExpired ? undefined : formatDday(notice.daysUntilExpiry),
    onClick: () => onNavigate('propertyVerify', { propertyId: notice.propertyId }),
  })),
});

// 인증이 만료된 호실이 있으면 세션당 한 번 띄우는 재인증 팝업.
export const RenewalDialog = ({ userId, notices, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const expired = notices.filter((notice) => notice.isExpired);
  const hasExpired = expired.length > 0;

  useEffect(() => {
    if (!hasExpired || wasShown(userId)) return;
    markShown(userId);
    setIsOpen(true);
  }, [hasExpired, userId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !hasExpired) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) setIsOpen(false);
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md space-y-4 rounded-card border border-line bg-surface p-6">
        <h2 id={titleId} className="text-card font-semibold text-ink">
          권리자 인증이 만료됐어요
        </h2>
        <ul className="space-y-1">
          {expired.map((notice) => (
            <li key={notice.id} className="flex items-center justify-between gap-3 text-body text-ink">
              <span className="min-w-0 truncate">{notice.displayName}</span>
              <span className="shrink-0 font-num text-sub tabular-nums text-ink-3">{notice.expiresOn}</span>
            </li>
          ))}
        </ul>
        <p className="text-body text-ink-2">{buildRenewalMessage(expired.some((notice) => notice.mentionsCommunity))}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsOpen(false)}>
            나중에
          </Button>
          <Button
            variant="verify"
            onClick={() => {
              setIsOpen(false);
              onNavigate('propertyVerify', { propertyId: expired[0].propertyId });
            }}
          >
            재인증
          </Button>
        </div>
      </div>
    </div>
  );
};

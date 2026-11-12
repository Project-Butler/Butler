import { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { VerificationBadge } from '../CommunityLayout/VerificationBadge';

// 건물 바꾸기 드롭다운. 생김새는 @butler/ui PropertySwitcher 를 그대로 따르고 "전체 보기" 칸만 없다
// (커뮤니티는 건물 하나를 골라야 열린다). 각 줄은 건물 선택 화면 카드의 정보를 한 줄로 — 임대인 인원 수는 여기에만(머리말 등 다른 곳에는 두지 않는다).
// 인증 전 · 만료 건물 줄에는 머리와 같은 배지('인증 전' · '인증 만료').
// buildings: GET /community/my-buildings 응답
export const BuildingSwitcher = ({ buildings, activeComplexId, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-input border border-line bg-surface px-3 py-2 text-body font-medium text-ink transition-colors hover:border-accent/40"
      >
        <Building2 size={16} className="text-ink-3" aria-hidden="true" />
        건물 바꾸기
        <ChevronDown size={14} aria-hidden="true" className={`text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="보유 건물"
          className="absolute right-0 top-[calc(100%+6px)] z-10 w-[32rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-btn border border-line bg-surface py-1"
        >
          {buildings.map((building) => {
            const isActive = building.complexId === activeComplexId;
            return (
              <button
                key={building.complexId}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setOpen(false);
                  if (!isActive) onChange(building.complexId);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-body ${
                  isActive ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-surface-2'
                }`}
              >
                <Building2 size={15} className="flex-none" aria-hidden="true" />
                <span className={`flex-none ${isActive ? 'font-semibold' : 'font-medium text-ink'}`}>{building.name}</span>
                {building.verificationStatus && building.verificationStatus !== 'VERIFIED' && (
                  <span className="flex-none">
                    <VerificationBadge blockedReason={building.verificationStatus} />
                  </span>
                )}
                <span className={`min-w-0 flex-1 truncate text-sub ${isActive ? '' : 'text-ink-3'}`}>
                  <span className="font-num tabular-nums">{building.unitCount}</span>호실 보유 · {building.regionName} · 임대인{' '}
                  <span className="font-num tabular-nums">{building.memberCount}</span>명
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

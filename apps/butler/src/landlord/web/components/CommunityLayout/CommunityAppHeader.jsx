import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { BuildingSwitcherRow } from '../CommunityBuildingSwitcher/BuildingSwitcher';
import { NicknameButton } from '../CommunityNickname/NicknameButton';
import { CommunityDialogFrame } from './CommunityDialogFrame';
import { SectionChips } from './SectionTabs';
import { VerificationBadge } from './VerificationBadge';

// 앱(임대인 앱) 탭 첫 화면의 머리 — CommunityFrame 이 앱일 때 PC 머리(PageHeader + 탭 줄) 대신 그린다.
// 정보는 PC 머리와 같다: 단지 이름(PC 제목) · 지역(PC 설명) · 닉네임 버튼 · 인증 배지 · 건물 바꾸기. 배치만 두 줄로:
//   1줄 단지 이름 ▾(건물이 둘 이상일 때만 — PC 의 [건물 바꾸기]가 그때만 있는 것과 같다) · 오른쪽 인증 배지
//   2줄 지역 · 닉네임 버튼("닉네임 · …" / "닉네임 정하기")
// 그 아래 가로 칩 줄(PC 탭 줄과 같은 목록 · 이름 · 주소). 건물 바꾸기는 아래 시트(CommunityDialogFrame — 앱 틀이 넘긴 Sheet).
export const CommunityAppHeader = ({ building, buildings, reason, nickname, section, onSelectBuilding }) => {
  const [isSwitchOpen, setIsSwitchOpen] = useState(false);
  const canSwitch = buildings.length > 1;

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-m-h1 font-semibold text-ink">
            {canSwitch ? (
              <button type="button" aria-haspopup="dialog" onClick={() => setIsSwitchOpen(true)} className="flex max-w-full items-center gap-1 text-left">
                <span className="truncate">{building.name}</span>
                <ChevronDown size={20} className="flex-none text-ink-3" aria-hidden="true" />
                <span className="sr-only">건물 바꾸기</span>
              </button>
            ) : (
              <span className="block truncate">{building.name}</span>
            )}
          </h1>
          <span className="flex-none">
            <VerificationBadge blockedReason={reason} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body text-ink-2">{building.regionName}</span>
          {nickname && (
            <>
              <span aria-hidden="true" className="text-sub text-ink-3">
                ·
              </span>
              <NicknameButton nickname={nickname.nickname} onClick={() => nickname.open()} />
            </>
          )}
        </div>
      </div>
      <SectionChips activeSection={section} />
      {isSwitchOpen && (
        <BuildingSwitchSheet
          buildings={buildings}
          activeComplexId={building.complexId}
          onClose={() => setIsSwitchOpen(false)}
          onPick={(complexId) => {
            setIsSwitchOpen(false);
            if (complexId !== building.complexId) onSelectBuilding(complexId);
          }}
        />
      )}
    </div>
  );
};

// 건물 바꾸기 시트. 제목은 PC 버튼 이름 "건물 바꾸기", 줄은 PC 드롭다운과 같은 줄(BuildingSwitcherRow — 이름 · 배지 · 호실 · 지역 · 인원).
// Esc 로 닫고, 열리면 지금 건물 줄로 포커스(닫으면 열기 전 자리로).
const BuildingSwitchSheet = ({ buildings, activeComplexId, onPick, onClose }) => {
  const dialogRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    (dialogRef.current?.querySelector('[aria-checked="true"]') ?? dialogRef.current?.querySelector('button'))?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <CommunityDialogFrame dialogRef={dialogRef} labelledBy="community-building-switch-title" onClose={onClose}>
      <div className="flex items-center justify-between gap-4">
        <h2 id="community-building-switch-title" className="text-section font-semibold text-ink">
          건물 바꾸기
        </h2>
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="-mr-3 flex h-11 w-11 items-center justify-center rounded-input text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div role="radiogroup" aria-label="보유 건물" className="-mx-3 flex flex-col gap-1">
        {buildings.map((item) => (
          <BuildingSwitcherRow
            key={item.complexId}
            building={item}
            isActive={item.complexId === activeComplexId}
            role="radio"
            stacked
            onPick={() => onPick(item.complexId)}
          />
        ))}
      </div>
    </CommunityDialogFrame>
  );
};

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, X } from 'lucide-react';
import { BuildingSwitcherRow } from '../../../web/components/CommunityBuildingSwitcher/BuildingSwitcher';
import { CommunityDialogFrame } from '../../../web/components/CommunityLayout/CommunityDialogFrame';
import { COMMUNITY_SECTIONS } from '../../../web/components/CommunityLayout/SectionTabs';
import { VerificationBadge } from '../../../web/components/CommunityLayout/VerificationBadge';
import { nicknameButtonText } from '../../../web/components/CommunityNickname/NicknameButton';
import { COMMUNITY_PATH } from '../../../web/routes';
import { DotLine } from './AppListRows';

// 앱 커뮤니티 탭 첫 화면의 머리 — PC 머리(PageHeader + 탭 줄)와 같은 정보를 휴대폰 배치로(머리 두 겹):
//   상단 바 왼쪽: 단지 이름 ▾(BuildingTitle — 앱 틀의 상단 바 자리에 그린다, 누르면 건물 바꾸기 시트)
//   그 아래 한 줄: 인증 배지 · 지역 · 닉네임 버튼(HeaderInfoLine) — PC 머리의 배지 · 설명 · 닉네임과 같은 문구
//   그 아래 칩 줄(SectionChips): PC 탭 줄과 같은 목록 · 이름 · 주소, 화면을 내려도 상단 바 밑에 붙어 있다(sticky)
// 건물이 하나면 ▾ 없이 이름만(PC 도 그때는 [건물 바꾸기]가 없다).

// 상단 바 왼쪽 "단지 이름 ▾". 이름이 길면 두 줄까지(자르지 않고 줄을 바꾼다 — 세 줄이 넘는 이름만 말줄임)
export const BuildingTitle = ({ building, buildings, onSelectBuilding }) => {
  const [isOpen, setIsOpen] = useState(false);
  const canSwitch = buildings.length > 1;
  const name = <span className="line-clamp-2 break-keep break-words text-m-card font-semibold text-ink">{building.name}</span>;
  return (
    <h1 className="min-w-0">
      {canSwitch ? (
        <button type="button" aria-haspopup="dialog" onClick={() => setIsOpen(true)} className="flex min-h-11 max-w-full items-center gap-1 text-left">
          {name}
          <ChevronDown size={20} className="flex-none text-ink-3" aria-hidden="true" />
          <span className="sr-only">건물 바꾸기</span>
        </button>
      ) : (
        name
      )}
      {isOpen && (
        <BuildingSwitchSheet
          buildings={buildings}
          activeComplexId={building.complexId}
          onClose={() => setIsOpen(false)}
          onPick={(complexId) => {
            setIsOpen(false);
            if (complexId !== building.complexId) onSelectBuilding(complexId);
          }}
        />
      )}
    </h1>
  );
};

// 상단 바 밑 한 줄: 인증 배지 · 지역 · 닉네임 버튼(누르면 닉네임 시트). 좁으면 줄을 바꾼다(자르지 않음)
export const HeaderInfoLine = ({ building, reason, nickname }) => (
  <DotLine className="text-m-sub text-ink-2">
    <span className="inline-flex min-h-11 items-center">
      <VerificationBadge blockedReason={reason} />
    </span>
    <span>{building.regionName}</span>
    {nickname && (
      <button type="button" onClick={() => nickname.open()} className="min-h-11 whitespace-nowrap text-left text-m-sub font-semibold text-ink-2">
        {nicknameButtonText(nickname.nickname)}
      </button>
    )}
  </DotLine>
);

// 칩 줄 — 탭 대신. top: 상단 바 높이(px, 앱 틀이 잰다) — 그 밑에 붙어 있게.
// 칩 다섯 개가 360px 폭에도 한 줄에 들어간다(넘치면 가로로 밀어 본다 — 칩 줄 안에서만)
export const SectionChips = ({ activeSection, top }) => {
  const navigate = useNavigate();
  return (
    <nav aria-label="커뮤니티 메뉴" style={{ top }} className="sticky z-[5] -mx-5 flex gap-1.5 overflow-x-auto bg-ground px-5 py-1.5 [scrollbar-width:none]">
      {COMMUNITY_SECTIONS.map((section) => {
        const isActive = section.key === activeSection;
        return (
          <button
            key={section.key}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => navigate(`${COMMUNITY_PATH}/${section.key}`)}
            className={`flex min-h-11 flex-none items-center whitespace-nowrap rounded-full border px-3 text-m-label ${
              isActive ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-surface font-medium text-ink-2'
            }`}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
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

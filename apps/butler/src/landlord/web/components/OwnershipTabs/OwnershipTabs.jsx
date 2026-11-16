import { Archive, Building2 } from 'lucide-react';

// 내 부동산의 현재/예전 소유 탭. 두 화면 머리 오른쪽 같은 자리·같은 모양(세그먼트, design.md §5).
// active: 'OWNER' | 'FORMER_OWNER'. 개수를 모르면(불러오는 중) 숫자를 비운다.
const TABS = [
  { relation: 'OWNER', label: '현재 소유', icon: Building2, key: 'buildingList' },
  { relation: 'FORMER_OWNER', label: '예전 소유', icon: Archive, key: 'properties' },
];

export const OwnershipTabs = ({ active, counts = {}, onNavigate }) => (
  <div role="tablist" aria-label="소유 구분" className="flex rounded-btn border border-line bg-surface-2 p-1">
    {TABS.map(({ relation, label, icon: Icon, key }) => {
      const isSelected = relation === active;
      return (
        <button
          key={relation}
          type="button"
          role="tab"
          aria-selected={isSelected}
          onClick={() => !isSelected && onNavigate(key, relation === 'FORMER_OWNER' ? { relation } : {}, { replace: true })}
          className={`flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-input px-4 text-body transition-colors ${
            isSelected ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-2 hover:text-ink'
          }`}
        >
          <Icon size={15} aria-hidden="true" />
          {label}
          {counts[relation] != null && <span className="font-num tabular-nums">{counts[relation]}</span>}
        </button>
      );
    })}
  </div>
);

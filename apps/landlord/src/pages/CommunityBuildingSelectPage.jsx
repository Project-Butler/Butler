import { Button } from '@butler/ui';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { BuildingOption } from '../components/CommunityBuildingSelect/BuildingOption';
import { EmptyState } from '../components/CommunityLayout/EmptyState';

// /community/buildings 건물 선택 화면. PC 에서는 머리의 "건물 바꾸기" 드롭다운이 대신하므로 두 경우에만 그린다.
// - 인증 건물이 0개: 머리 · 탭 줄 없이 빈 상태. "권리자 인증하기"는 갈 화면(다른 담당)이 없어 비활성
// - 주소로 직접 들어온 경우: 건물 카드 2열 + 아래 묶음 안내 한 줄. 고르면 /community
export const CommunityBuildingSelectPage = ({ buildings, currentComplexId, onSelect }) => {
  if (buildings.length === 0) {
    return (
      <div className="w-full max-w-6xl space-y-6 pb-10">
        <EmptyState title="아직 인증을 마친 건물이 없습니다" description="보유하신 호실로 인증을 시작해 보세요">
          <Button variant="verifyOutline" disabled>
            권리자 인증하기
          </Button>
        </EmptyState>
      </div>
    );
  }

  const unitTotal = buildings.reduce((sum, building) => sum + building.unitCount, 0);
  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader title="건물 선택" />
      <nav aria-label="보유 건물" className="grid gap-4 lg:grid-cols-2">
        {buildings.map((building) => (
          <div key={building.complexId} className="overflow-hidden rounded-card border border-line bg-surface">
            <BuildingOption building={building} isSelected={building.complexId === currentComplexId} onSelect={onSelect} />
          </div>
        ))}
      </nav>
      <p className="break-keep text-sub text-ink-3">
        호실 <span className="font-num font-medium tabular-nums">{unitTotal}</span>개가 건물{' '}
        <span className="font-num font-medium tabular-nums">{buildings.length}</span>개로 묶여 있습니다. 커뮤니티는 건물 단위로
        열립니다.
      </p>
    </div>
  );
};

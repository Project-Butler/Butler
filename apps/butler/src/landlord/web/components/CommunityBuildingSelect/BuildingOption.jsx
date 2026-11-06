import { Check } from 'lucide-react';
import { VerificationBadge } from '../CommunityLayout/VerificationBadge';

// 건물 선택 화면의 건물 한 줄. 선택된 건물은 체크 + accent-soft 배경.
// 임대인 인원 수(memberCount)는 이 화면에만 보인다(머리말에 두면 모수가 작을 때 "아무도 없다"가 늘 보이고 작성자가 추려질 수 있다).
export const BuildingOption = ({ building, isSelected, onSelect }) => (
  <button
    type="button"
    aria-current={isSelected ? 'true' : undefined}
    onClick={() => onSelect(building.complexId)}
    className={`flex w-full items-start gap-3 border-t border-line p-4 text-left text-ink first:border-t-0 ${
      isSelected ? 'bg-accent-soft' : ''
    }`}
  >
    <span aria-hidden="true" className="mt-px flex h-[22px] w-[22px] flex-none items-center justify-center">
      {isSelected ? (
        <Check size={22} strokeWidth={2.25} className="text-accent-strong" />
      ) : (
        <i className="block h-5 w-5 rounded-full border-2 border-line bg-surface" />
      )}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-card font-semibold">{building.name}</span>
          {building.verificationStatus && building.verificationStatus !== 'VERIFIED' && (
          <VerificationBadge blockedReason={building.verificationStatus} />
        )}
        </span>
        <span className={`whitespace-nowrap text-sub font-medium ${isSelected ? 'text-accent-strong' : 'text-ink-3'}`}>
          <span className="font-num font-semibold tabular-nums">{building.unitCount}</span>호실 보유
        </span>
      </span>
      <span className="text-sub text-ink-3">{building.regionName}</span>
      <span className="text-sub text-ink-3">
        임대인 <span className="font-num font-medium tabular-nums">{building.memberCount}</span>명
      </span>
    </span>
  </button>
);

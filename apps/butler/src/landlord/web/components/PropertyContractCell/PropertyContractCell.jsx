import { Badge, Button } from '@butler/ui';
import { useFindCurrentContract } from '../../hooks/useFindCurrentContract';
import { getPropertyStatusBadge } from '../../utils/unitListing';

// 계약 칸(S-07): 공실이면 [계약 등록], 계약이 있으면 상태 칩(누를 때 지금 계약을 찾아 상세로 간다, D-09)
export const PropertyContractCell = ({ property, onNavigate, onUnauthorized, onNotice }) => {
  const currentContract = useFindCurrentContract({ onUnauthorized });
  const badge = getPropertyStatusBadge(property.status);

  const openCurrentContract = async () => {
    onNotice(null);
    const { data: contract, error } = await currentContract.findContract(property.id);
    if (contract) onNavigate('contractDetail', { contractId: contract.id });
    else if (error) onNotice(error.message);
    else onNotice('진행 중이거나 시작 전인 계약을 찾지 못했어요.');
  };

  if (property.status === 'VACANT') {
    return (
      <Button variant="secondary" size="sm" onClick={() => onNavigate('contractRegister', { propertyId: property.id })}>
        계약 등록
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={openCurrentContract}
      disabled={currentContract.isLoading}
      aria-label={`${badge.label} 계약 보기`}
      className="disabled:opacity-60"
    >
      <Badge tone={badge.tone}>{badge.label}</Badge>
    </button>
  );
};

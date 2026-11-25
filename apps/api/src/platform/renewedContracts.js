// 갱신 계약이 등록된 계약 찾기(#242). 갱신 계약 = previousContractId가 그 계약이고 해지(취소)되지 않은 계약.
// 같은 소유 관계 안에서만 이어진다(contracts/service.js assertPreviousContract). 새 임차인 계약은 previousContractId가 없다.
// client: prisma 또는 트랜잭션의 tx. 돌려주는 값: 갱신 계약이 있는 계약 id의 Set.
export const findRenewedContractIds = async (client, contractIds) => {
  if (contractIds.length === 0) return new Set();
  const rows = await client.contract.findMany({
    where: { previousContractId: { in: contractIds }, terminatedOn: null },
    select: { previousContractId: true },
  });
  return new Set(rows.map((row) => row.previousContractId));
};

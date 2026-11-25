// 일정(api-contract.md 7장, #161). 지금은 계약에서 계산한 SYSTEM 일정만 있다(USER 일정 POST·PATCH·DELETE는 다음 단계).
// 본인 것만: 임대인은 활성 소유 관계의 해지 안 된 계약, 임차인은 연결된 해지 안 된 계약. 운영자는 빈 목록.
// 소유가 끝나면 일정은 다음 소유자에게 넘어가지 않는다(계약 5장 이력 넘기기 규칙).
import { prisma } from '../../platform/prismaClient.js';
import { findRenewedContractIds } from '../../platform/renewedContracts.js';
import { buildContractSchedules, compareSchedules } from './systemSchedules.js';

const toDbDate = (dateString) => new Date(`${dateString}T00:00:00Z`);

const CONTRACT_SELECT = {
  id: true,
  leaseType: true,
  monthlyRent: true,
  rentPaymentDay: true,
  startDate: true,
  endDate: true,
  terminatedOn: true,
  ownership: { select: { property: { include: { complex: true } } } },
};

// 임대인은 통지 마감을 거르려고 통지 도달일도 읽는다(#242).
const LANDLORD_CONTRACT_SELECT = { ...CONTRACT_SELECT, renewalNotices: { select: { deliveredOn: true } } };

// 계약 만기·입금일·통지 마감은 모두 종료일 이전이라, 종료일이 조회 시작일보다 앞선 계약은 볼 필요가 없다.
const findContracts = (where, fromDate, select = CONTRACT_SELECT) =>
  prisma.contract.findMany({ where: { ...where, terminatedOn: null, endDate: { gte: toDbDate(fromDate) } }, select });

// GET /schedules?fromDate&toDate — 범위는 컨트롤러가 검사했다.
export const findMySchedules = async (user, { fromDate, toDate }) => {
  const range = { fromDate, toDate };
  if (user.role === 'LANDLORD') {
    const contracts = await findContracts({ ownership: { userId: user.id, endedAt: null } }, fromDate, LANDLORD_CONTRACT_SELECT);
    const renewedIds = await findRenewedContractIds(prisma, contracts.map((contract) => contract.id));
    return contracts
      .flatMap((contract) => buildContractSchedules(contract, { viewer: 'LANDLORD', ...range, renewed: renewedIds.has(contract.id) }))
      .sort(compareSchedules);
  }
  if (user.role === 'TENANT') {
    const contracts = await findContracts({ tenantId: user.id }, fromDate);
    return contracts.flatMap((contract) => buildContractSchedules(contract, { viewer: 'TENANT', ...range })).sort(compareSchedules);
  }
  return [];
};

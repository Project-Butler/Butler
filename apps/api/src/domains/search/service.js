// 통합 검색(api-contract.md 7장 "검색" v1.1, #172). 유형마다 각 도메인 목록과 같은 범위에서 찾는다.
// 권한 판단은 새로 짜지 않고 하우스 로그·티켓·서류함·일정의 범위 함수를 그대로 쓴다.
import { computeContractStatus } from '../../platform/contractStatus.js';
import { CONTRACT_RESOURCE, TICKET_RESOURCE } from '../../platform/documentAttachments.js';
import { addDaysToDateString, compareDateStrings, getNow, getTodayKST, toDateOnlyString } from '../../platform/dateUtils.js';
import { toVisibleLogWhere } from '../../platform/managementLogRules.js';
import { toMoney } from '../../platform/money.js';
import { compareUnits } from '../../platform/naturalSort.js';
import { prisma } from '../../platform/prismaClient.js';
import { toPropertySummary } from '../../platform/propertySerializer.js';
import { documentBoxWhere } from '../documents/documentBox.js';
import { findMySchedules } from '../schedules/service.js';
import { toVisibleTicketWhere } from '../tickets/service.js';
import { includesAllKeywords, interpretQuery, keywordsWhere, MAX_RESULTS_PER_TYPE } from './searchQuery.js';

// 일정은 저장된 행이 없어(SYSTEM 일정) 오늘 앞뒤 이 기간만 계산해서 찾는다.
export const SCHEDULE_SEARCH_DAYS = 93;

const PROPERTY_INCLUDE = { complex: true };
const CONTRACT_FIELDS = { id: true, startDate: true, endDate: true, terminatedOn: true, leaseType: true, deposit: true, monthlyRent: true };
const IN_PROGRESS = ['ACTIVE', 'EXPIRING_SOON'];

const EMPTY_RESULT = { properties: [], contracts: [], tickets: [], managementLogs: [], documents: [], schedules: [] };

const propertyScopeWhere = (scopedPropertyIds, field = 'propertyId') => (scopedPropertyIds ? { [field]: { in: scopedPropertyIds } } : {});

// 본인이 볼 수 있는 호실과 그 바탕(소유 관계·계약). 검색어 해석과 유형별 범위에 같이 쓴다.
//   임대인: 내 소유 관계 전부(끝난 것 포함, 목록에서 지운 것 제외 — H-41)와 그 계약. 호실 결과는 활성 소유 관계의 호실만.
//   임차인: 내가 임차인인 계약 전부. 호실 결과는 해지되지 않은 계약의 호실만.
const loadViewerContext = async (user) => {
  if (user.role === 'LANDLORD') {
    const ownerships = await prisma.ownership.findMany({
      where: { userId: user.id, removedAt: null },
      include: { property: { include: PROPERTY_INCLUDE }, contracts: { select: CONTRACT_FIELDS } },
    });
    return {
      ownerships,
      contracts: ownerships.flatMap((ownership) => ownership.contracts.map((contract) => ({ ...contract, propertyId: ownership.propertyId }))),
      properties: dedupeProperties(ownerships.map((ownership) => ownership.property)),
      resultPropertyIds: new Set(ownerships.filter((ownership) => !ownership.endedAt).map((ownership) => ownership.propertyId)),
    };
  }
  const contracts = await prisma.contract.findMany({
    where: { tenantId: user.id },
    select: { ...CONTRACT_FIELDS, ownership: { select: { propertyId: true, property: { include: PROPERTY_INCLUDE } } } },
  });
  return {
    ownerships: [],
    contracts: contracts.map(({ ownership, ...contract }) => ({ ...contract, propertyId: ownership.propertyId })),
    properties: dedupeProperties(contracts.map((contract) => contract.ownership.property)),
    resultPropertyIds: new Set(contracts.filter((contract) => !contract.terminatedOn).map((contract) => contract.ownership.propertyId)),
  };
};

const dedupeProperties = (properties) => [...new Map(properties.map((property) => [property.id, property])).values()];

// 호실의 지금 계약: 진행 중 → 시작 전 → 없음. 같은 상태면 늦게 시작한 계약.
const pickCurrentContract = (contracts, todayKST) => {
  const withStatus = contracts
    .map((contract) => ({ contract, status: computeContractStatus(contract, todayKST) }))
    .sort((a, b) => compareDateStrings(toDateOnlyString(b.contract.startDate), toDateOnlyString(a.contract.startDate)));
  const picked = withStatus.find(({ status }) => IN_PROGRESS.includes(status)) ?? withStatus.find(({ status }) => status === 'UPCOMING');
  if (!picked) return null;
  const { contract, status } = picked;
  return { id: contract.id, status, leaseType: contract.leaseType, deposit: toMoney(contract.deposit), monthlyRent: toMoney(contract.monthlyRent) };
};

const searchProperties = (context, { scopedPropertyIds }, todayKST) => {
  if (!scopedPropertyIds) return [];
  const scoped = new Set(scopedPropertyIds);
  return context.properties
    .filter((property) => scoped.has(property.id) && context.resultPropertyIds.has(property.id))
    .map((property) => ({
      ...toPropertySummary(property),
      currentContract: pickCurrentContract(
        context.contracts.filter((contract) => contract.propertyId === property.id),
        todayKST,
      ),
    }))
    .sort(compareUnits)
    .slice(0, MAX_RESULTS_PER_TYPE);
};

// 임차인 이름 검색이라 임대인만. 계약 목록과 같은 범위(내 소유 관계의 계약, 끝난 소유 포함).
const searchContracts = async (user, { keywords, scopedPropertyIds }, todayKST) => {
  if (user.role !== 'LANDLORD') return [];
  const rows = await prisma.contract.findMany({
    where: {
      AND: [
        { ownership: { userId: user.id, removedAt: null, ...propertyScopeWhere(scopedPropertyIds) } },
        keywordsWhere(keywords, ['tenantName']),
      ],
    },
    include: { ownership: { select: { property: { include: PROPERTY_INCLUDE } } } },
    orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
    take: MAX_RESULTS_PER_TYPE,
  });
  return rows.map((contract) => ({
    id: contract.id,
    property: toPropertySummary(contract.ownership.property),
    tenantName: contract.tenantName,
    status: computeContractStatus(contract, todayKST),
    startDate: toDateOnlyString(contract.startDate),
    endDate: toDateOnlyString(contract.endDate),
  }));
};

const searchTickets = async (user, { keywords, scopedPropertyIds }) => {
  const rows = await prisma.ticket.findMany({
    where: { AND: [toVisibleTicketWhere(user), propertyScopeWhere(scopedPropertyIds), keywordsWhere(keywords, ['title'])] },
    include: { property: { include: PROPERTY_INCLUDE } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: MAX_RESULTS_PER_TYPE,
  });
  return rows.map((ticket) => ({
    id: ticket.id,
    property: toPropertySummary(ticket.property),
    title: ticket.title,
    category: ticket.category,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
  }));
};

// 하우스 로그는 소유 관계에 붙어 있어 임대인만.
const searchManagementLogs = async (user, context, { keywords, scopedPropertyIds }) => {
  if (user.role !== 'LANDLORD') return [];
  const rows = await prisma.propertyLog.findMany({
    where: {
      AND: [toVisibleLogWhere(user, context.ownerships, getNow()), propertyScopeWhere(scopedPropertyIds), keywordsWhere(keywords, ['title', 'content'])],
    },
    include: { property: { include: PROPERTY_INCLUDE } },
    orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    take: MAX_RESULTS_PER_TYPE,
  });
  return rows.map((log) => ({
    id: log.id,
    property: toPropertySummary(log.property),
    type: log.type,
    title: log.title,
    occurredOn: toDateOnlyString(log.occurredOn),
  }));
};

// 문서가 붙은 리소스 → 호실. 호실 조건이 있으면 그 호실의 리소스만 남긴다.
const inScope = (propertyId, scopedPropertyIds) => !scopedPropertyIds || scopedPropertyIds.includes(propertyId);

// 임대인: 서류함과 같은 범위(내 소유 서류 + 내 계약 서류). 임차인: 내 계약에 수락한 초대로 공유받은 문서 + 내가 볼 수 있는 티켓의 첨부.
const documentScope = async (user, context, scopedPropertyIds) => {
  const propertyByResource = new Map();
  const contracts = context.contracts.filter((contract) => inScope(contract.propertyId, scopedPropertyIds));
  for (const contract of contracts) propertyByResource.set(contract.id, contract.propertyId);

  if (user.role === 'LANDLORD') {
    const ownerships = context.ownerships.filter((ownership) => inScope(ownership.propertyId, scopedPropertyIds));
    for (const ownership of ownerships) propertyByResource.set(ownership.id, ownership.propertyId);
    const where = await documentBoxWhere(user, { ownershipIds: ownerships.map((o) => o.id), contractIds: contracts.map((c) => c.id) });
    return { where, propertyByResource };
  }

  const tickets = await prisma.ticket.findMany({
    where: { AND: [toVisibleTicketWhere(user), propertyScopeWhere(scopedPropertyIds)] },
    select: { id: true, propertyId: true },
  });
  for (const ticket of tickets) propertyByResource.set(ticket.id, ticket.propertyId);
  const contractIds = contracts.map((contract) => contract.id);
  return {
    where: {
      deletedAt: null,
      OR: [
        {
          resourceType: CONTRACT_RESOURCE,
          resourceId: { in: contractIds },
          invitationShares: { some: { invitation: { contractId: { in: contractIds }, status: 'ACCEPTED', acceptedById: user.id } } },
        },
        { resourceType: TICKET_RESOURCE, resourceId: { in: tickets.map((ticket) => ticket.id) } },
      ],
    },
    propertyByResource,
  };
};

const searchDocuments = async (user, context, { keywords, scopedPropertyIds }) => {
  const { where, propertyByResource } = await documentScope(user, context, scopedPropertyIds);
  const rows = await prisma.document.findMany({
    where: { AND: [where, keywordsWhere(keywords, ['fileName'])] },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: MAX_RESULTS_PER_TYPE,
  });
  const propertiesById = new Map(context.properties.map((property) => [property.id, property]));
  const missingIds = [...new Set(rows.map((row) => propertyByResource.get(row.resourceId)).filter((id) => id && !propertiesById.has(id)))];
  if (missingIds.length > 0) {
    const extra = await prisma.property.findMany({ where: { id: { in: missingIds } }, include: PROPERTY_INCLUDE });
    for (const property of extra) propertiesById.set(property.id, property);
  }
  return rows.map((document) => {
    const property = propertiesById.get(propertyByResource.get(document.resourceId));
    return {
      id: document.id,
      fileName: document.fileName,
      mimeType: document.mimeType,
      type: document.type,
      resourceType: document.resourceType,
      resourceId: document.resourceId,
      property: property ? toPropertySummary(property) : null,
      createdAt: document.createdAt.toISOString(),
    };
  });
};

// 일정 목록과 같은 범위. 앞으로 올 일정을 가까운 순으로 먼저, 지난 일정은 최근 순으로 뒤에.
const searchSchedules = async (user, { keywords, scopedPropertyIds }, todayKST) => {
  const schedules = await findMySchedules(user, {
    fromDate: addDaysToDateString(todayKST, -SCHEDULE_SEARCH_DAYS),
    toDate: addDaysToDateString(todayKST, SCHEDULE_SEARCH_DAYS),
  });
  const matched = schedules.filter(
    (schedule) => (!scopedPropertyIds || scopedPropertyIds.includes(schedule.property?.id)) && includesAllKeywords(schedule.title, keywords),
  );
  const upcoming = matched.filter((schedule) => compareDateStrings(schedule.date, todayKST) >= 0);
  const past = matched.filter((schedule) => compareDateStrings(schedule.date, todayKST) < 0).reverse();
  return [...upcoming, ...past].slice(0, MAX_RESULTS_PER_TYPE);
};

// GET /search — query·types는 컨트롤러가 검사했다. 요청하지 않은 유형은 [].
export const searchAll = async (user, { query, types }) => {
  const context = await loadViewerContext(user);
  const interpreted = interpretQuery(query, context.properties);
  // 호실 조건이 있는데 맞는 호실이 없으면 어느 유형도 결과가 없다.
  if (interpreted.scopedPropertyIds?.length === 0) return { ...EMPTY_RESULT };

  const todayKST = getTodayKST();
  const wants = (type) => types.includes(type);
  const skip = async () => [];
  const [contracts, tickets, managementLogs, documents, schedules] = await Promise.all([
    wants('CONTRACT') ? searchContracts(user, interpreted, todayKST) : skip(),
    wants('TICKET') ? searchTickets(user, interpreted) : skip(),
    wants('MANAGEMENT_LOG') ? searchManagementLogs(user, context, interpreted) : skip(),
    wants('DOCUMENT') ? searchDocuments(user, context, interpreted) : skip(),
    wants('SCHEDULE') ? searchSchedules(user, interpreted, todayKST) : skip(),
  ]);
  return {
    properties: wants('PROPERTY') ? searchProperties(context, interpreted, todayKST) : [],
    contracts,
    tickets,
    managementLogs,
    documents,
    schedules,
  };
};

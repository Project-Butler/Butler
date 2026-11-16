// 티켓(수리·점검 요청, 계약 5장). 임차인이 요청하고 임대인이 처리한다.
// 쓰기는 티켓이 붙은 소유 관계 행을 잠근 트랜잭션 안에서 한다(platform/ownershipLock.js) — 소유 종료·관리 로그와 줄을 선다.
import { AppError } from '../../platform/AppError.js';
import { audit } from '../../platform/audit.js';
import { computeContractStatus } from '../../platform/contractStatus.js';
import { getNow, getTodayKST } from '../../platform/dateUtils.js';
import { attachDocumentsInTx, TICKET_RESOURCE, withAttachments } from '../../platform/documentAttachments.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { prisma } from '../../platform/prismaClient.js';
import { appendPropertyHistory } from '../../platform/propertyHistory.js';
import {
  checkTicketTransition,
  findForbiddenTicketFields,
  isTicketEnded,
  resolveTicketActor,
  TICKET_REQUESTABLE_CONTRACT_STATUSES,
} from '../../platform/ticketRules.js';
import { TICKET_INCLUDE, toTicketResponse } from '../../platform/ticketSerializer.js';

const throwPropertyNotFound = () => {
  throw new AppError('PROPERTY_NOT_FOUND', 404, '호실을 찾을 수 없습니다.');
};

export const throwTicketNotFound = () => {
  throw new AppError('TICKET_NOT_FOUND', 404, '요청을 찾을 수 없습니다.');
};

const throwTicketReadOnly = (message) => {
  throw new AppError('TICKET_READ_ONLY', 422, message);
};

const throwInvalidTransition = (message) => {
  throw new AppError('TICKET_INVALID_TRANSITION', 422, message);
};

const STATUS_LABELS = { OPEN: '접수', IN_PROGRESS: '처리 중', DONE: '완료', CANCELED: '취소' };

const respondOne = async (client, ticket, user) => {
  const [withDocuments] = await withAttachments(client, TICKET_RESOURCE, [ticket]);
  return toTicketResponse(withDocuments, user);
};

// 볼 수 있는 범위: 이 티켓을 처리하는 소유자(소유가 끝난 뒤에도 본인 것), 요청자, 운영자.
// 다음 소유자에게는 넘어가지 않는다(완료 요약만 관리 로그로 넘어간다).
const toVisibleTicketWhere = (user) =>
  user.role === 'ADMIN' ? {} : { OR: [{ ownership: { userId: user.id } }, { requesterId: user.id }] };

// 임대인: 이 호실의 내 활성 소유 관계. 임차인: 이 호실의 시작 전·진행 중 계약(소유 관계가 활성인 것).
// 찾은 소유 관계를 잠가서 { ownership, contractId }로 돌려준다. 없으면 404로 호실을 숨긴다.
const lockRequestTarget = async (tx, user, propertyId) => {
  if (user.role === 'LANDLORD') {
    const active = await tx.ownership.findFirst({ where: { userId: user.id, propertyId, endedAt: null }, select: { id: true } });
    if (!active) throwPropertyNotFound();
    const ownership = await lockOwnershipRow(tx, active.id);
    if (!ownership || ownership.endedAt) throwPropertyNotFound();
    return { ownership, contractId: null };
  }

  const todayKST = getTodayKST();
  const contracts = await tx.contract.findMany({
    where: { tenantId: user.id, terminatedOn: null, ownership: { propertyId, endedAt: null } },
    select: { id: true, ownershipId: true, startDate: true, endDate: true, terminatedOn: true },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  });
  const requestable = contracts.filter((contract) =>
    TICKET_REQUESTABLE_CONTRACT_STATUSES.includes(computeContractStatus(contract, todayKST)),
  );
  // 진행 중 계약이 있으면 그 계약, 없으면 가장 먼저 시작하는 예정 계약.
  const contract =
    requestable.find((item) => computeContractStatus(item, todayKST) !== 'UPCOMING') ?? requestable[0];
  if (!contract) throwPropertyNotFound();
  const ownership = await lockOwnershipRow(tx, contract.ownershipId);
  // 잠금을 기다리는 사이 소유가 끝났거나 계약이 해지됐을 수 있다.
  const stillOpen = await tx.contract.findFirst({ where: { id: contract.id, terminatedOn: null }, select: { id: true } });
  if (!ownership || ownership.endedAt || !stillOpen) throwPropertyNotFound();
  return { ownership, contractId: contract.id };
};

// POST /tickets — 사진은 먼저 미연결 문서로 올리고(POST /documents) 그 id를 attachmentDocumentIds로 넘긴다.
export const createTicket = async (user, { propertyId, attachmentDocumentIds = [], ...input }) => {
  const created = await prisma.$transaction(async (tx) => {
    const { ownership, contractId } = await lockRequestTarget(tx, user, propertyId);
    const ticket = await tx.ticket.create({
      data: { ...input, propertyId, ownershipId: ownership.id, contractId, requesterId: user.id },
      include: TICKET_INCLUDE,
    });
    await attachDocumentsInTx(tx, user, {
      resourceType: TICKET_RESOURCE,
      resourceId: ticket.id,
      documentIds: attachmentDocumentIds,
      now: getNow(),
    });
    // TODO(notifications): 임차인이 만들면 임대인에게 TICKET_CREATED 알림. notify()가 생기면 연결한다.
    return ticket;
  });
  return respondOne(prisma, created, user);
};

const buildFilters = ({ propertyId, statuses, categories }) => ({
  ...(propertyId ? { propertyId } : {}),
  ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
  ...(categories.length > 0 ? { category: { in: categories } } : {}),
});

// GET /tickets — 볼 수 있는 것만. 최근 요청 순(sortDirection).
export const findTickets = async (user, { page, size, sortDirection, ...filters }) => {
  const where = { AND: [toVisibleTicketWhere(user), buildFilters(filters)] };
  const [total, rows] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      include: TICKET_INCLUDE,
      orderBy: [{ createdAt: sortDirection }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    }),
  ]);
  const tickets = await withAttachments(prisma, TICKET_RESOURCE, rows);
  return {
    items: tickets.map((ticket) => toTicketResponse(ticket, user)),
    meta: { page, size, total, hasNext: page * size < total },
  };
};

// GET /tickets/:ticketId — 볼 수 없으면 null(컨트롤러가 404).
export const findTicketForUser = async (user, ticketId) => {
  const ticket = await prisma.ticket.findFirst({
    where: { AND: [{ id: ticketId }, toVisibleTicketWhere(user)] },
    include: TICKET_INCLUDE,
  });
  return ticket ? respondOne(prisma, ticket, user) : null;
};

// 티켓을 볼 수 있는지(문서 조회 권한). 목록·상세와 같은 범위다.
export const canViewTicket = async (user, ticketId) => {
  const ticket = await prisma.ticket.findFirst({
    where: { AND: [{ id: ticketId }, toVisibleTicketWhere(user)] },
    select: { id: true },
  });
  return Boolean(ticket);
};

// 쓰기 공통: 티켓을 찾고 그 소유 관계를 잠근 뒤 다시 읽는다. 처리 소유자도 요청자도 아니면 404로 숨긴다.
const lockTicket = async (tx, user, ticketId) => {
  const found = await tx.ticket.findUnique({ where: { id: ticketId }, select: { ownershipId: true } });
  if (!found) throwTicketNotFound();
  await lockOwnershipRow(tx, found.ownershipId);
  const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, include: TICKET_INCLUDE });
  const actor = resolveTicketActor(ticket, user);
  if (!actor.isOwner && !actor.isRequester) throwTicketNotFound();
  return { ticket, actor };
};

// 문서를 붙이거나 지울 수 있는 티켓을 잠가서 돌려준다(documents/resourcePolicies.js).
// 활성 소유자는 끝나기 전까지, 요청자는 접수(OPEN) 상태일 때만 사진을 더하고 뺄 수 있다.
export const lockWritableTicket = async (tx, user, ticketId) => {
  const { ticket, actor } = await lockTicket(tx, user, ticketId);
  if (isTicketEnded(ticket.status)) throwTicketReadOnly('완료되거나 취소된 요청은 바꿀 수 없습니다.');
  if (!actor.isActiveOwner && !(actor.isRequester && ticket.status === 'OPEN')) {
    throwTicketReadOnly('처리가 시작된 요청은 사진을 바꿀 수 없습니다.');
  }
  return ticket;
};

// DONE이 되면 관리 로그에 요약을 남긴다. 소유 관계가 인증 상태면 호실 이력(다음 소유자에게 넘어감), 아니면 나만 보기.
// 다음 소유자에게 넘어갈 수 있으므로 임차인이 쓴 설명·이름은 넣지 않는다. 제목·처리 내용·수리 비용만 남긴다.
const appendTicketSummary = (tx, ticket) =>
  appendPropertyHistory({
    propertyId: ticket.propertyId,
    ownershipId: ticket.ownershipId,
    type: 'TICKET_SUMMARY',
    title: ticket.title,
    content: ticket.resolutionNote ?? null,
    occurredOn: getTodayKST(),
    cost: ticket.cost ?? null,
    source: { feature: 'platform', resourceType: TICKET_RESOURCE, resourceId: ticket.id },
    client: tx,
  });

// PATCH /tickets/:ticketId — data는 컨트롤러가 검증한 값(보낸 칸만).
// 요청자: title·description(OPEN일 때만), status → CANCELED. 활성 소유자: status·resolutionNote·cost.
export const updateTicket = async (user, ticketId, { status, ...fields }, req) => {
  const updated = await prisma.$transaction(async (tx) => {
    const { ticket, actor } = await lockTicket(tx, user, ticketId);
    if (isTicketEnded(ticket.status)) throwTicketReadOnly('완료되거나 취소된 요청은 바꿀 수 없습니다.');

    const forbidden = findForbiddenTicketFields(ticket, actor, Object.keys(fields));
    if (forbidden.length > 0) {
      throw new AppError('TICKET_READ_ONLY', 422, '지금 바꿀 수 없는 항목이 있습니다.', forbidden.map((field) => ({ field, reason: '바꿀 수 없습니다.' })));
    }

    const statusChanged = status !== undefined && status !== ticket.status;
    if (statusChanged) {
      const result = checkTicketTransition(ticket.status, status, actor);
      if (result === 'INVALID_TRANSITION') {
        throwInvalidTransition(`${STATUS_LABELS[ticket.status]} 상태에서 ${STATUS_LABELS[status]}(으)로 바꿀 수 없습니다.`);
      }
      if (result === 'FORBIDDEN') throwInvalidTransition('요청한 분은 취소만 할 수 있습니다.');
    }

    const now = getNow();
    let row = await tx.ticket.update({
      where: { id: ticket.id },
      data: { ...fields, ...(statusChanged ? { status } : {}), ...(statusChanged && isTicketEnded(status) ? { closedAt: now } : {}) },
      include: TICKET_INCLUDE,
    });

    if (statusChanged && status === 'DONE') {
      const log = await appendTicketSummary(tx, row);
      row = await tx.ticket.update({ where: { id: row.id }, data: { logId: log.id }, include: TICKET_INCLUDE });
    }
    if (statusChanged) {
      await audit.record({
        actor: user,
        action: 'TICKET_STATUS_CHANGED',
        resourceType: 'TICKET',
        resourceId: row.id,
        summary: `요청 상태 변경: ${STATUS_LABELS[ticket.status]} → ${STATUS_LABELS[status]}`,
        before: { status: ticket.status },
        after: { status },
        req,
        client: tx,
      });
      // TODO(notifications): 상대방에게 TICKET_STATUS_CHANGED 알림. notify()가 생기면 연결한다.
    }
    return row;
  });
  return respondOne(prisma, updated, user);
};

// 임대인·임차인 소통(계약 6장). 스레드는 계약·티켓 하나에 하나, 참여자는 서버가 컨텍스트에서 정한다.
// 실시간 연결은 없다. 화면이 after 커서로 새 메시지를 주기적으로 가져온다.
import { AppError } from '../../platform/AppError.js';
import { afterCreatedAtCursor, toCursorPage } from '../../platform/createdAtCursor.js';
import { getNow, getTodayKST } from '../../platform/dateUtils.js';
import { attachDocumentsInTx, THREAD_MESSAGE_RESOURCE, toAttachmentResponse, withAttachments } from '../../platform/documentAttachments.js';
import { prisma } from '../../platform/prismaClient.js';
import { contractEndOn, formatThreadTitle, isThreadContextReadOnly } from '../../platform/threadRules.js';

const USER_SUMMARY = { select: { id: true, name: true, role: true } };
const THREAD_INCLUDE = { participants: { include: { user: USER_SUMMARY }, orderBy: { createdAt: 'asc' } } };
const MESSAGE_INCLUDE = { sender: USER_SUMMARY };

export const throwThreadNotFound = () => {
  throw new AppError('THREAD_NOT_FOUND', 404, '대화를 찾을 수 없습니다.');
};

export const throwMessageNotFound = () => {
  throw new AppError('MESSAGE_NOT_FOUND', 404, '메시지를 찾을 수 없습니다.');
};

const throwThreadReadOnly = (message = '종료된 대화에는 메시지를 보낼 수 없습니다.') => {
  throw new AppError('THREAD_READ_ONLY', 422, message);
};

const CONTEXT_NOT_FOUND = {
  CONTRACT: () => {
    throw new AppError('CONTRACT_NOT_FOUND', 404, '계약을 찾을 수 없습니다.');
  },
  TICKET: () => {
    throw new AppError('TICKET_NOT_FOUND', 404, '요청을 찾을 수 없습니다.');
  },
};

// ── 컨텍스트 ─────────────────────────────────────────────
// 컨텍스트마다 { landlordId, tenantId, title, readOnlyInput }. 없으면 Map에 없다.
const PROPERTY_SELECT = { select: { buildingNo: true, unitNo: true } };

const loadContractContexts = async (client, ids) => {
  if (ids.length === 0) return [];
  const contracts = await client.contract.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      tenantId: true,
      endDate: true,
      terminatedOn: true,
      ownership: { select: { userId: true, endedAt: true, property: PROPERTY_SELECT } },
    },
  });
  return contracts.map((contract) => [
    `CONTRACT:${contract.id}`,
    {
      landlordId: contract.ownership.userId,
      tenantId: contract.tenantId,
      title: formatThreadTitle('CONTRACT', { property: contract.ownership.property }),
      readOnlyInput: { ownershipEndedAt: contract.ownership.endedAt, contractEndOn: contractEndOn(contract) },
    },
  ]);
};

const loadTicketContexts = async (client, ids) => {
  if (ids.length === 0) return [];
  const tickets = await client.ticket.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      closedAt: true,
      property: PROPERTY_SELECT,
      ownership: { select: { userId: true, endedAt: true } },
      contract: { select: { tenantId: true } },
    },
  });
  return tickets.map((ticket) => [
    `TICKET:${ticket.id}`,
    {
      landlordId: ticket.ownership.userId,
      // 임차인이 요청한 티켓만 상대가 있다. 임대인이 직접 만든 티켓(contract 없음)은 스레드를 만들 수 없다.
      tenantId: ticket.contract?.tenantId ?? null,
      title: formatThreadTitle('TICKET', { property: ticket.property, ticketTitle: ticket.title }),
      readOnlyInput: { ownershipEndedAt: ticket.ownership.endedAt, closedAt: ticket.closedAt },
    },
  ]);
};

// refs: [{ contextType, contextId }] → Map('TYPE:id' → 컨텍스트)
const loadContexts = async (client, refs) => {
  const idsOf = (type) => [...new Set(refs.filter((ref) => ref.contextType === type).map((ref) => ref.contextId))];
  const [contracts, tickets] = await Promise.all([
    loadContractContexts(client, idsOf('CONTRACT')),
    loadTicketContexts(client, idsOf('TICKET')),
  ]);
  return new Map([...contracts, ...tickets]);
};

const contextKey = (thread) => `${thread.contextType}:${thread.contextId}`;

const isContextReadOnly = (context) =>
  !context || isThreadContextReadOnly(context.readOnlyInput, { now: getNow(), todayKST: getTodayKST() });

// ── 응답 ─────────────────────────────────────────────────
// 운영자가 숨긴 메시지는 body·첨부를 내주지 않는다.
const toMessageResponse = (message) => ({
  id: message.id,
  threadId: message.threadId,
  sender: message.sender,
  body: message.isHidden ? null : message.body,
  isHidden: message.isHidden,
  attachments: message.isHidden ? [] : (message.attachments ?? []).map(toAttachmentResponse),
  sentAt: message.createdAt.toISOString(),
});

const toThreadResponse = (thread, context, { lastMessage, unreadCount }) => ({
  id: thread.id,
  contextType: thread.contextType,
  contextId: thread.contextId,
  title: context?.title ?? null,
  participants: thread.participants.map((participant) => participant.user),
  lastMessage: lastMessage ? toMessageResponse(lastMessage) : null,
  unreadCount,
  isReadOnly: isContextReadOnly(context),
  createdAt: thread.createdAt.toISOString(),
});

// 내가 마지막으로 읽은 메시지 다음의 상대 메시지 수. 참여자가 아니면(운영자) 0.
const countUnread = async (client, thread, user) => {
  const participant = thread.participants.find((item) => item.userId === user.id);
  if (!participant) return 0;
  const lastRead = participant.lastReadMessageId
    ? await client.threadMessage.findUnique({ where: { id: participant.lastReadMessageId }, select: { id: true, createdAt: true } })
    : null;
  return client.threadMessage.count({
    where: {
      threadId: thread.id,
      senderId: { not: user.id },
      ...(lastRead ? { OR: [{ createdAt: { gt: lastRead.createdAt } }, { createdAt: lastRead.createdAt, id: { gt: lastRead.id } }] } : {}),
    },
  });
};

const findLastMessage = async (client, threadId) => {
  const message = await client.threadMessage.findFirst({
    where: { threadId },
    include: MESSAGE_INCLUDE,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (!message) return null;
  const [withDocuments] = await withAttachments(client, THREAD_MESSAGE_RESOURCE, [message]);
  return withDocuments;
};

const respondThreads = async (client, threads, user) => {
  const contexts = await loadContexts(client, threads);
  return Promise.all(
    threads.map(async (thread) => {
      const [lastMessage, unreadCount] = await Promise.all([findLastMessage(client, thread.id), countUnread(client, thread, user)]);
      return toThreadResponse(thread, contexts.get(contextKey(thread)), { lastMessage, unreadCount });
    }),
  );
};

// ── 스레드 ───────────────────────────────────────────────
const isParticipant = (thread, user) => thread.participants.some((participant) => participant.userId === user.id);

// POST /threads — 멱등. 이미 있으면 { created: false }(200), 새로 만들면 { created: true }(201).
export const openThread = async (user, { contextType, contextId }) => {
  const contexts = await loadContexts(prisma, [{ contextType, contextId }]);
  const context = contexts.get(`${contextType}:${contextId}`);
  // 그 계약·티켓의 임대인·임차인이 아니면 존재를 숨긴다.
  if (!context || (context.landlordId !== user.id && context.tenantId !== user.id)) CONTEXT_NOT_FOUND[contextType]();
  if (!context.tenantId) {
    throw new AppError('THREAD_CONTEXT_NOT_SUPPORTED', 422, '임차인이 연결되지 않아 대화를 시작할 수 없습니다.');
  }

  const where = { contextType_contextId: { contextType, contextId } };
  let thread = await prisma.thread.findUnique({ where, include: THREAD_INCLUDE });
  let created = false;
  if (!thread) {
    try {
      thread = await prisma.thread.create({
        data: {
          contextType,
          contextId,
          participants: { create: [{ userId: context.landlordId }, { userId: context.tenantId }] },
        },
        include: THREAD_INCLUDE,
      });
      created = true;
    } catch (error) {
      // 같은 컨텍스트로 동시에 만들면 뒤 요청은 유니크에 걸린다. 먼저 만든 스레드를 돌려준다.
      if (error?.code !== 'P2002') throw error;
      thread = await prisma.thread.findUnique({ where, include: THREAD_INCLUDE });
    }
  }
  const [response] = await respondThreads(prisma, [thread], user);
  return { thread: response, created };
};

// GET /threads — 참여한 것만, 최근 메시지 순(메시지가 없는 스레드는 뒤로).
export const findThreads = async (user, { contextType, contextId, page, size }) => {
  const where = {
    participants: { some: { userId: user.id } },
    ...(contextType ? { contextType } : {}),
    ...(contextId ? { contextId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.thread.count({ where }),
    prisma.thread.findMany({
      where,
      include: THREAD_INCLUDE,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    }),
  ]);
  return { items: await respondThreads(prisma, rows, user), meta: { page, size, total, hasNext: page * size < total } };
};

// 참여자·운영자만 본다. 그 밖에는 404로 숨긴다.
const findVisibleThread = async (client, user, threadId) => {
  const thread = await client.thread.findUnique({ where: { id: threadId }, include: THREAD_INCLUDE });
  if (!thread || (user.role !== 'ADMIN' && !isParticipant(thread, user))) throwThreadNotFound();
  return thread;
};

// GET /threads/:threadId
export const findThreadForUser = async (user, threadId) => {
  const thread = await findVisibleThread(prisma, user, threadId);
  const [response] = await respondThreads(prisma, [thread], user);
  return response;
};

// ── 메시지 ───────────────────────────────────────────────
const withMessageAttachments = (client, messages) => withAttachments(client, THREAD_MESSAGE_RESOURCE, messages);

// GET /threads/:threadId/messages
// cursor 방식: 최신순으로 지난 메시지. after 방식: after 메시지 다음부터 오래된 순(새 메시지 폴링, nextCursor는 null).
export const findMessages = async (user, threadId, { cursor, after, size }) => {
  await findVisibleThread(prisma, user, threadId);

  if (after) {
    const anchor = await prisma.threadMessage.findFirst({ where: { id: after, threadId }, select: { id: true, createdAt: true } });
    if (!anchor) throwMessageNotFound();
    const rows = await prisma.threadMessage.findMany({
      where: { threadId, OR: [{ createdAt: { gt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { gt: anchor.id } }] },
      include: MESSAGE_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: size + 1,
    });
    const hasNext = rows.length > size;
    const messages = await withMessageAttachments(prisma, rows.slice(0, size));
    return { items: messages.map(toMessageResponse), meta: { nextCursor: null, hasNext } };
  }

  const rows = await prisma.threadMessage.findMany({
    where: { threadId, ...afterCreatedAtCursor(cursor) },
    include: MESSAGE_INCLUDE,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: size + 1,
  });
  const { items, meta } = toCursorPage(rows, size);
  const messages = await withMessageAttachments(prisma, items);
  return { items: messages.map(toMessageResponse), meta };
};

// 쓰기 공통: 참여자만, 스레드 행을 잠가 메시지 보내기·읽음 처리가 줄을 서게 한다.
const lockThreadForParticipant = async (tx, user, threadId) => {
  await tx.$queryRaw`SELECT id FROM threads WHERE id = ${threadId}::uuid FOR UPDATE`;
  const thread = await tx.thread.findUnique({ where: { id: threadId }, include: THREAD_INCLUDE });
  if (!thread || !isParticipant(thread, user)) throwThreadNotFound();
  return thread;
};

// POST /threads/:threadId/messages — 수정·삭제할 수 없다. 사진은 먼저 미연결 문서로 올리고 id를 넘긴다.
export const sendMessage = async (user, threadId, { body, attachmentDocumentIds = [] }) => {
  const created = await prisma.$transaction(async (tx) => {
    const thread = await lockThreadForParticipant(tx, user, threadId);
    const contexts = await loadContexts(tx, [thread]);
    if (isContextReadOnly(contexts.get(contextKey(thread)))) throwThreadReadOnly();

    const now = getNow();
    const message = await tx.threadMessage.create({
      data: { threadId, senderId: user.id, body, createdAt: now },
      include: MESSAGE_INCLUDE,
    });
    await attachDocumentsInTx(tx, user, { resourceType: THREAD_MESSAGE_RESOURCE, resourceId: message.id, documentIds: attachmentDocumentIds, now });
    await tx.thread.update({ where: { id: threadId }, data: { lastMessageAt: now } });
    // 내가 보낸 메시지까지는 읽은 것으로 본다.
    await tx.threadParticipant.update({
      where: { threadId_userId: { threadId, userId: user.id } },
      data: { lastReadMessageId: message.id, lastReadAt: now },
    });
    // TODO(notifications): 상대방에게 MESSAGE_RECEIVED 알림(연속 발송은 묶어서). notify()가 생기면 연결한다.
    const [withDocuments] = await withMessageAttachments(tx, [message]);
    return withDocuments;
  });
  return toMessageResponse(created);
};

// POST /threads/:threadId/read — 읽은 위치를 앞으로만 옮긴다(이미 더 뒤를 읽었으면 그대로).
export const markThreadRead = async (user, threadId, { lastReadMessageId }) => {
  await prisma.$transaction(async (tx) => {
    const thread = await lockThreadForParticipant(tx, user, threadId);
    const message = await tx.threadMessage.findFirst({ where: { id: lastReadMessageId, threadId }, select: { id: true, createdAt: true } });
    if (!message) throwMessageNotFound();

    const participant = thread.participants.find((item) => item.userId === user.id);
    if (participant.lastReadMessageId) {
      const current = await tx.threadMessage.findUnique({ where: { id: participant.lastReadMessageId }, select: { id: true, createdAt: true } });
      const isBehind = current && (current.createdAt > message.createdAt || (current.createdAt.getTime() === message.createdAt.getTime() && current.id >= message.id));
      if (isBehind) return;
    }
    await tx.threadParticipant.update({
      where: { id: participant.id },
      data: { lastReadMessageId: message.id, lastReadAt: getNow() },
    });
  });
};

// ── 문서 첨부(documents/resourcePolicies.js) ───────────────
// 메시지 첨부를 볼 수 있는지: 그 스레드의 참여자·운영자. 숨긴 메시지의 첨부는 운영자만.
export const canViewMessage = async (user, messageId) => {
  const message = await prisma.threadMessage.findUnique({
    where: { id: messageId },
    select: { isHidden: true, thread: { select: { participants: { select: { userId: true } } } } },
  });
  if (!message) return false;
  if (user.role === 'ADMIN') return true;
  return !message.isHidden && message.thread.participants.some((participant) => participant.userId === user.id);
};

// 보낸 메시지는 바꿀 수 없으므로 나중에 첨부를 붙이거나 지울 수 없다. 첨부는 메시지를 보낼 때만 붙인다.
export const lockWritableMessage = async (tx, user, messageId) => {
  if (!(await canViewMessage(user, messageId))) throwMessageNotFound();
  throwThreadReadOnly('보낸 메시지의 첨부는 바꿀 수 없습니다.');
};

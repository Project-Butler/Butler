import { DisputeCategory, DisputeReferenceType } from '@prisma/client';
import { prisma } from '../../platform/prismaClient.js';

export const SORTABLE_FIELDS = ['createdAt', 'title', 'sourcePage'];
// Prisma는 nullable 컬럼에만 nulls 옵션을 받는다.
const NULLABLE_SORT_FIELDS = ['sourcePage'];

const buildOrderBy = ({ field, direction }) => [
  { [field]: NULLABLE_SORT_FIELDS.includes(field) ? { sort: direction, nulls: 'last' } : direction },
  // 같은 값끼리 순서가 페이지마다 바뀌지 않도록 id로 한 번 더 정렬한다.
  { id: 'asc' },
];

// 목록에는 본문(content)과 결과(outcome)를 빼고 보낸다.
const LIST_SELECT = {
  id: true,
  type: true,
  propertyKind: true,
  category: true,
  title: true,
  summary: true,
  keywords: true,
  sourceTitle: true,
  sourcePage: true,
};

const buildKeywordWhere = (keyword) => ({
  OR: [
    { title: { contains: keyword, mode: 'insensitive' } },
    { summary: { contains: keyword, mode: 'insensitive' } },
    { content: { contains: keyword, mode: 'insensitive' } },
    { outcome: { contains: keyword, mode: 'insensitive' } },
    { keywords: { has: keyword } },
  ],
});

const buildWhere = ({ propertyKind, ...exactFilters }, keyword) => {
  const conditions = [exactFilters];
  // propertyKind가 null인 자료(FAQ 등)는 주택·상가 공통이라 어느 쪽으로 걸러도 함께 보여준다.
  if (propertyKind) conditions.push({ OR: [{ propertyKind }, { propertyKind: null }] });
  if (keyword) conditions.push(buildKeywordWhere(keyword));
  return { AND: conditions };
};

const toCounts = (values, groups, field) =>
  Object.fromEntries(values.map((value) => [value, groups.find((group) => group[field] === value)?._count._all ?? 0]));

export const findReferences = async ({ filters, keyword, page, size, orderBy }) => {
  const where = buildWhere(filters, keyword);
  const { type: _type, category, ...baseFilters } = filters;

  // 화면 숫자용 개수. 종류 탭(countsByType)은 고른 종류만 빼고, 상황 타일(countsByCategory)은
  // 종류·유형을 둘 다 빼고 같은 검색 조건으로 센다.
  const [items, total, typeGroups, categoryGroups] = await prisma.$transaction([
    prisma.disputeReference.findMany({
      where,
      select: LIST_SELECT,
      orderBy: buildOrderBy(orderBy),
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.disputeReference.count({ where }),
    prisma.disputeReference.groupBy({
      by: ['type'],
      where: buildWhere(category ? { ...baseFilters, category } : baseFilters, keyword),
      _count: { _all: true },
      orderBy: { type: 'asc' },
    }),
    prisma.disputeReference.groupBy({
      by: ['category'],
      where: buildWhere(baseFilters, keyword),
      _count: { _all: true },
      orderBy: { category: 'asc' },
    }),
  ]);

  return {
    items,
    meta: {
      page,
      size,
      total,
      hasNext: page * size < total,
      countsByType: toCounts(Object.values(DisputeReferenceType), typeGroups, 'type'),
      countsByCategory: toCounts(Object.values(DisputeCategory), categoryGroups, 'category'),
    },
  };
};

export const findReferenceById = async (referenceId) => {
  const found = await prisma.disputeReference.findUnique({ where: { id: referenceId } });
  if (!found) return null;

  // 임베딩은 챗봇 검색 내부용이라 응답에 넣지 않는다.
  const { embedding: _embedding, ...reference } = found;
  return {
    ...reference,
    createdAt: reference.createdAt.toISOString(),
    updatedAt: reference.updatedAt.toISOString(),
  };
};

// 자주 묻는 질문의 근거 자료(sourceKey → 요약). faqs.js가 쓴다.
export const findReferenceSummariesBySourceKeys = async (sourceKeys) => {
  if (sourceKeys.length === 0) return new Map();
  const references = await prisma.disputeReference.findMany({
    where: { sourceKey: { in: sourceKeys } },
    select: { sourceKey: true, id: true, type: true, category: true, title: true },
  });
  return new Map(references.map(({ sourceKey, ...reference }) => [sourceKey, reference]));
};

// 관련 자료를 고를 때 쓰는 기준 자료의 임베딩과 분쟁 유형. 없는 자료면 null.
export const findReferenceForRelated = (referenceId) =>
  prisma.disputeReference.findUnique({
    where: { id: referenceId },
    select: { id: true, category: true, embedding: true },
  });

// 관련 자료 후보(기준 자료 제외). 목록과 같은 필드에 유사도 계산용 임베딩을 더한다.
export const findRelatedCandidates = (excludeId) =>
  prisma.disputeReference.findMany({
    where: { id: { not: excludeId }, embedding: { isEmpty: false } },
    select: { ...LIST_SELECT, embedding: true },
  });

// 임베딩이 아직 없을 때(embed:disputes 실행 전) 쓰는 대체: 같은 분쟁 유형의 최근 자료.
export const findSameCategoryReferences = ({ excludeId, category, limit }) =>
  prisma.disputeReference.findMany({
    where: { id: { not: excludeId }, category },
    select: LIST_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: limit,
  });

// ===== 분쟁 상담 챗봇 =====

// 한 대화에 쌓을 수 있는 메시지 수(질문+답변). 대화가 길수록 요청마다 보내는 이력과 비용이 커진다.
export const MAX_CHAT_MESSAGES = 40;
const CHAT_TITLE_LENGTH = 50;

const REFERENCE_SUMMARY_SELECT = { id: true, type: true, title: true, sourceTitle: true, sourcePage: true };

// RAG 검색 후보 전체(임베딩 포함). 임베딩이 아직 없는 자료(embed:disputes 실행 전)는 뺀다.
export const findReferencesForRetrieval = () =>
  prisma.disputeReference.findMany({
    where: { embedding: { isEmpty: false } },
    select: {
      id: true,
      type: true,
      propertyKind: true,
      title: true,
      content: true,
      outcome: true,
      caseNumber: true,
      relatedLaws: true,
      sourceTitle: true,
      sourcePage: true,
      embedding: true,
    },
  });

const toChatSummary = (chat) => ({
  id: chat.id,
  title: chat.title,
  createdAt: chat.createdAt.toISOString(),
  updatedAt: chat.updatedAt.toISOString(),
});

// referenceIds 순서([1], [2] 번호)를 그대로 지켜서 references를 붙인다.
const toChatMessage = (message, referencesById) => ({
  id: message.id,
  role: message.role,
  content: message.content,
  references: message.referenceIds.map((id) => referencesById.get(id)).filter(Boolean),
  createdAt: message.createdAt.toISOString(),
});

const findReferenceSummaries = async (ids) => {
  if (ids.length === 0) return new Map();
  const references = await prisma.disputeReference.findMany({
    where: { id: { in: ids } },
    select: REFERENCE_SUMMARY_SELECT,
  });
  return new Map(references.map((reference) => [reference.id, reference]));
};

export const findChats = async ({ userId, page, size }) => {
  const where = { userId };
  const [chats, total] = await prisma.$transaction([
    prisma.disputeChat.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.disputeChat.count({ where }),
  ]);

  return {
    items: chats.map(toChatSummary),
    meta: { page, size, total, hasNext: page * size < total },
  };
};

// 다른 사용자의 대화는 없는 것과 똑같이 null을 돌려준다(호출부가 404로 응답).
export const findChatWithMessages = async ({ chatId, userId }) => {
  const chat = await prisma.disputeChat.findFirst({
    where: { id: chatId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!chat) return null;

  const referencesById = await findReferenceSummaries([...new Set(chat.messages.flatMap((m) => m.referenceIds))]);
  return {
    ...toChatSummary(chat),
    messages: chat.messages.map((message) => toChatMessage(message, referencesById)),
  };
};

// 이어서 질문할 때 Claude에 보낼 이전 대화. 다른 사용자의 대화면 null.
export const findChatHistory = async ({ chatId, userId }) => {
  const chat = await prisma.disputeChat.findFirst({
    where: { id: chatId, userId },
    select: { id: true, messages: { select: { role: true, content: true }, orderBy: { createdAt: 'asc' } } },
  });
  return chat?.messages ?? null;
};

// 질문과 답변을 함께 저장한다. 같은 트랜잭션 안의 now()는 값이 같아서 순서가 섞이므로
// createdAt을 직접 넣는다(질문 시각 < 답변 시각).
const toMessageRows = ({ question, questionAt, answer, answerAt }) => [
  { role: 'USER', content: question, referenceIds: [], createdAt: questionAt },
  {
    role: 'ASSISTANT',
    content: answer.content,
    referenceIds: answer.referenceIds,
    inputTokens: answer.inputTokens,
    outputTokens: answer.outputTokens,
    createdAt: answerAt,
  },
];

const toSavedMessages = async (messages) => {
  const referencesById = await findReferenceSummaries(messages.flatMap((m) => m.referenceIds));
  return messages.map((message) => toChatMessage(message, referencesById));
};

export const createChat = async ({ userId, question, questionAt, answer, answerAt }) => {
  const chat = await prisma.disputeChat.create({
    data: {
      userId,
      title: question.slice(0, CHAT_TITLE_LENGTH),
      messages: { create: toMessageRows({ question, questionAt, answer, answerAt }) },
    },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  return { ...toChatSummary(chat), messages: await toSavedMessages(chat.messages) };
};

export const appendChatMessages = async ({ chatId, question, questionAt, answer, answerAt }) => {
  const rows = toMessageRows({ question, questionAt, answer, answerAt });
  const messages = await prisma.$transaction([
    ...rows.map((row) => prisma.disputeChatMessage.create({ data: { ...row, chatId } })),
    // 목록을 최근 대화순으로 보여주기 위해 updatedAt을 갱신한다.
    prisma.disputeChat.update({ where: { id: chatId }, data: { updatedAt: answerAt } }),
  ]);

  return toSavedMessages(messages.slice(0, rows.length));
};

// 지운 건수를 돌려준다. 0이면 없거나 다른 사용자의 대화다.
export const deleteChat = async ({ chatId, userId }) => {
  const { count } = await prisma.disputeChat.deleteMany({ where: { id: chatId, userId } });
  return count;
};

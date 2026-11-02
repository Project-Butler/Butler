import { DisputeCategory, DisputeReferenceType, Prisma } from '@prisma/client';
import { prisma } from '../../platform/prismaClient.js';
import { findSynonyms, replaceSearchWord } from './searchSynonyms.js';
import { toSourceUrl } from './sourceLinks.js';

export const SORTABLE_FIELDS = ['createdAt', 'title', 'sourcePage'];
// 관련도 순은 컬럼이 아니라 검색어로 계산한 점수라 검색어가 있을 때만 쓴다(controller.js).
export const RELEVANCE_SORT_FIELD = 'relevance';
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
  // 원문 링크(sourceUrl)를 만드는 데만 쓰고 응답에서는 뺀다(toListItem).
  sourceKey: true,
  caseNumber: true,
};

const toListItem = ({ sourceKey, caseNumber, ...item }) => ({
  ...item,
  sourceUrl: toSourceUrl({ sourceKey, title: item.title, caseNumber }),
});

// 검색어를 공백으로 나눈 단어 목록(중복 제거). "보증금 반환"은 ['보증금', '반환'].
export const toSearchTerms = (keyword) => [...new Set(keyword.split(/\s+/).filter(Boolean))];

// 비용을 뜻하는 끝말. 자료에는 "도배비"보다 "도배·장판", "도배 35만 원"처럼 쓰인 경우가 많아서
// 이 끝말로 끝나는 단어는 끝말을 뗀 말로도 찾는다. 긴 끝말을 먼저 본다("도배비용"은 "도배").
const COST_SUFFIXES = ['비용', '비'];
// 남는 말이 한 글자면 떼지 않는다("준비"→"준", "설비"→"설"처럼 뜻이 없어지는 경우를 막는다).
const MIN_STEM_LENGTH = 2;

const stripCostSuffix = (term) => {
  const suffix = COST_SUFFIXES.find((candidate) => term.endsWith(candidate));
  const stem = suffix ? term.slice(0, -suffix.length) : '';
  return stem.length >= MIN_STEM_LENGTH ? [term, stem] : [term];
};

// 단어 하나로 찾을 말과 점수 배율: 입력한 말(바꿔 찾기·비용 끝말을 뗀 말 포함)은 2배, 그 동의어(searchSynonyms.js)는 1배.
// 동의어로만 맞은 자료가 입력한 말이 그대로 있는 자료를 앞지르지 않게 한다.
const toWeightedVariants = (term) => {
  const words = [...new Set(replaceSearchWord(term).flatMap(stripCostSuffix))];
  const synonyms = [...new Set(words.flatMap(findSynonyms))].filter((synonym) => !words.includes(synonym));
  return [...words.map((text) => ({ text, factor: 2 })), ...synonyms.map((text) => ({ text, factor: 1 }))];
};

// 단어 하나로 찾을 말 목록: 단어 그대로 + 비용 끝말을 뗀 말 + 그 둘의 동의어.
// "도배비"는 ['도배비', '도배'], "월세"는 ['월세', '차임', '임대료'], "수리비"는 ['수리비', '수리', '수선'].
export const toTermVariants = (term) => toWeightedVariants(term).map(({ text }) => text);

const buildTermWhere = (term) => ({
  OR: toTermVariants(term).flatMap((text) => [
    { title: { contains: text, mode: 'insensitive' } },
    { summary: { contains: text, mode: 'insensitive' } },
    { content: { contains: text, mode: 'insensitive' } },
    { outcome: { contains: text, mode: 'insensitive' } },
    { keywords: { has: text } },
  ]),
});

// 단어마다 제목·요약·본문·결과·키워드 중 한 곳에 있으면 되고(비용 끝말을 뗀 말·동의어도 인정), 모든 단어가 있어야 한다(AND).
// 단어가 서로 다른 필드에 있어도 된다. 예: "보증금 반환"은 "보증금을 반환하지 않아…"에도 걸린다.
const buildKeywordWhere = (keyword) => ({ AND: toSearchTerms(keyword).map(buildTermWhere) });

const buildWhere = ({ propertyKind, ...exactFilters }, keyword) => {
  const conditions = [exactFilters];
  // propertyKind가 null인 자료(FAQ 등)는 주택·상가 공통이라 어느 쪽으로 걸러도 함께 보여준다.
  if (propertyKind) conditions.push({ OR: [{ propertyKind }, { propertyKind: null }] });
  if (keyword) conditions.push(buildKeywordWhere(keyword));
  return { AND: conditions };
};

const toCounts = (values, groups, field) =>
  Object.fromEntries(values.map((value) => [value, groups.find((group) => group[field] === value)?._count._all ?? 0]));

// 관련도 점수: 단어가 어느 필드에 있는지에 따라 더한다(제목 > 요약·키워드 > 본문·결과).
// 비용 끝말을 뗀 말·동의어도 따로 더한다 — 같은 필드라면 "도배비"가 그대로 있는 자료가 "도배"로도 점수를 받아 "도배"만 있는 자료보다 앞선다.
// 입력한 말은 2배, 동의어는 1배로 더한다(toWeightedVariants).
// 단어가 둘 이상이고 검색어가 띄어 쓴 그대로 붙어 있으면 입력한 말과 같은 배율로 한 번 더 더한다.
const RELEVANCE_WEIGHTS = { title: 3, summary: 2, keywords: 2, content: 1, outcome: 1 };

// ILIKE에서 %, _, \는 특수 문자라 글자 그대로 찾도록 이스케이프한다(Prisma contains와 같은 결과).
const escapeLike = (text) => text.replace(/[\\%_]/g, (char) => `\\${char}`);
const ilikeScore = (column, text, weight) =>
  Prisma.sql`(CASE WHEN ${Prisma.raw(column)} ILIKE ${`%${escapeLike(text)}%`} THEN ${weight} ELSE 0 END)`;

const buildTextScore = (text, factor) =>
  Prisma.join(
    [
      ilikeScore('title', text, RELEVANCE_WEIGHTS.title * factor),
      ilikeScore('summary', text, RELEVANCE_WEIGHTS.summary * factor),
      ilikeScore('content', text, RELEVANCE_WEIGHTS.content * factor),
      ilikeScore("coalesce(outcome, '')", text, RELEVANCE_WEIGHTS.outcome * factor),
    ],
    ' + ',
  );

const PHRASE_FACTOR = 2;

const buildRelevanceScore = (keyword) => {
  const terms = toSearchTerms(keyword);
  const scores = terms.flatMap(toWeightedVariants).map(
    ({ text, factor }) =>
      Prisma.sql`${buildTextScore(text, factor)} + (CASE WHEN ${text} = ANY(keywords) THEN ${RELEVANCE_WEIGHTS.keywords * factor} ELSE 0 END)`,
  );
  if (terms.length > 1) scores.push(buildTextScore(terms.join(' '), PHRASE_FACTOR));
  return Prisma.join(scores, ' + ');
};

// 검색 조건에 맞는 id 중 한 페이지를 점수 순으로 고른다. 점수가 같으면 id 순서로 페이지마다 순서를 고정한다.
const findPageIdsByRelevance = async (ids, keyword, direction, page, size) => {
  if (ids.length === 0) return [];
  const rows = await prisma.$queryRaw`
    SELECT id FROM dispute_references
    WHERE id = ANY(${ids}::uuid[])
    ORDER BY ${buildRelevanceScore(keyword)} ${direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}, id ASC
    LIMIT ${size} OFFSET ${(page - 1) * size}`;
  return rows.map((row) => row.id);
};

const findReferencePageByRelevance = async (matchedIds, keyword, { direction }, page, size) => {
  const pageIds = await findPageIdsByRelevance(matchedIds, keyword, direction, page, size);
  const items = await prisma.disputeReference.findMany({ where: { id: { in: pageIds } }, select: LIST_SELECT });
  return pageIds.map((id) => toListItem(items.find((item) => item.id === id)));
};

export const findReferences = async ({ filters, keyword, page, size, orderBy }) => {
  const where = buildWhere(filters, keyword);
  const { type: _type, category, ...baseFilters } = filters;
  // 관련도 순이면 조건에 맞는 id만 먼저 받고, 점수 계산·페이지 자르기는 SQL로 한다.
  const byRelevance = orderBy.field === RELEVANCE_SORT_FIELD;

  // 화면 숫자용 개수. 종류 탭(countsByType)은 고른 종류만 빼고, 상황 타일(countsByCategory)은
  // 종류·유형을 둘 다 빼고 같은 검색 조건으로 센다.
  const [found, total, typeGroups, categoryGroups] = await prisma.$transaction([
    byRelevance
      ? prisma.disputeReference.findMany({ where, select: { id: true } })
      : prisma.disputeReference.findMany({
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

  const items = byRelevance
    ? await findReferencePageByRelevance(
        found.map((reference) => reference.id),
        keyword,
        orderBy,
        page,
        size,
      )
    : found.map(toListItem);

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
    sourceUrl: toSourceUrl(reference),
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
export const findRelatedCandidates = async (excludeId) => {
  const candidates = await prisma.disputeReference.findMany({
    where: { id: { not: excludeId }, embedding: { isEmpty: false } },
    select: { ...LIST_SELECT, embedding: true },
  });
  return candidates.map(toListItem);
};

// 임베딩이 아직 없을 때(embed:disputes 실행 전) 쓰는 대체: 같은 분쟁 유형의 최근 자료.
export const findSameCategoryReferences = async ({ excludeId, category, limit }) => {
  const references = await prisma.disputeReference.findMany({
    where: { id: { not: excludeId }, category },
    select: LIST_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: limit,
  });
  return references.map(toListItem);
};

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

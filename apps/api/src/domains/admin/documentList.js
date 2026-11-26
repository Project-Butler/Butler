// GET /admin/documents — 관리자 문서 목록(api-contract.md 8장). 조회 전용, 메타데이터만.
// 이 응답으로는 어떤 파일 내용에도 닿을 수 없다: 다운로드 주소·저장 경로·업로드 id를 넣지 않는다(허용 목록으로 직접 만든다).
// 문서별 내용 열람 권한은 documents/resourcePolicies.js 그대로다(이 목록은 그 규칙을 바꾸지 않는다).
//
// 목록 규칙(docs/18 계획 4·5장):
//   - 숨긴(삭제한) 문서는 뺀다.
//   - 아직 아무 데도 안 붙은 임시 문서(resourceType null)는 뺀다 — resourceType IN 조건이 null을 거른다.
//   - 권리자 인증 증빙으로 연결된 문서(evidenceFor)는 뺀다.
//   - 소유 종료(endedAt)·판 사람의 목록 지우기(removedAt)로 거르지 않는다. 숨긴 메시지의 첨부도 그대로 나온다.
//
// 첨부 위치가 다형(resourceType/resourceId, FK 없음)이라 호실·이동 대상은 쪽(20건)을 읽은 뒤 종류별로 묶어서 찾는다.
// PROPERTY_RESOLVERS의 키는 SUPPORTED_RESOURCE_TYPES와 같아야 한다(테스트가 확인한다).
import { prisma } from '../../platform/prismaClient.js';
import { addDaysToDateString } from '../../platform/dateUtils.js';
import { toPropertySummary } from '../../platform/propertySerializer.js';
import { SUPPORTED_RESOURCE_TYPES } from '../documents/resourcePolicies.js';

const PROPERTY_INCLUDE = { include: { complex: true } };

const toPageMeta = (page, size, total) => ({ page, size, total, hasNext: page * size < total });

const byId = (rows, toTarget) => new Map(rows.map((row) => [row.id, toTarget(row)]));

const target = (property, link = null) => ({ property: property ? toPropertySummary(property) : null, link });

// 메시지 방이 붙은 계약·티켓의 호실. 그 밖의 contextType(등록형)은 호실을 모른다.
const findThreadContextProperties = async (threads) => {
  const idsOf = (type) => [...new Set(threads.filter((thread) => thread.contextType === type).map((thread) => thread.contextId))];
  const contractIds = idsOf('CONTRACT');
  const ticketIds = idsOf('TICKET');
  // 빈 묶음이면 쿼리를 보내지 않는다.
  const [contracts, tickets] = await Promise.all([
    contractIds.length
      ? prisma.contract.findMany({ where: { id: { in: contractIds } }, select: { id: true, ownership: { select: { property: PROPERTY_INCLUDE } } } })
      : [],
    ticketIds.length ? prisma.ticket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, property: PROPERTY_INCLUDE } }) : [],
  ]);
  return {
    CONTRACT: new Map(contracts.map((contract) => [contract.id, contract.ownership.property])),
    TICKET: new Map(tickets.map((ticket) => [ticket.id, ticket.property])),
  };
};

// resourceType → (id 묶음) → Map(resourceId → { property, link }). link는 관리자 화면에 상세가 있는 계약·티켓만.
export const PROPERTY_RESOLVERS = {
  CONTRACT: async (ids) => {
    const rows = await prisma.contract.findMany({ where: { id: { in: ids } }, select: { id: true, ownership: { select: { property: PROPERTY_INCLUDE } } } });
    return byId(rows, (row) => target(row.ownership.property, { type: 'CONTRACT', id: row.id }));
  },
  OWNERSHIP: async (ids) => {
    const rows = await prisma.ownership.findMany({ where: { id: { in: ids } }, select: { id: true, property: PROPERTY_INCLUDE } });
    return byId(rows, (row) => target(row.property));
  },
  TICKET: async (ids) => {
    const rows = await prisma.ticket.findMany({ where: { id: { in: ids } }, select: { id: true, property: PROPERTY_INCLUDE } });
    return byId(rows, (row) => target(row.property, { type: 'TICKET', id: row.id }));
  },
  MANAGEMENT_LOG: async (ids) => {
    const rows = await prisma.propertyLog.findMany({ where: { id: { in: ids } }, select: { id: true, property: PROPERTY_INCLUDE } });
    return byId(rows, (row) => target(row.property));
  },
  RENEWAL_NOTICE: async (ids) => {
    const rows = await prisma.renewalNotice.findMany({
      where: { id: { in: ids } },
      select: { id: true, contractId: true, contract: { select: { ownership: { select: { property: PROPERTY_INCLUDE } } } } },
    });
    return byId(rows, (row) => target(row.contract.ownership.property, { type: 'CONTRACT', id: row.contractId }));
  },
  // 메시지는 이동 링크를 만들지 않는다(관리자 메시지 화면이 없다). 호실만 방의 계약·티켓을 거쳐 찾는다.
  THREAD_MESSAGE: async (ids) => {
    const rows = await prisma.threadMessage.findMany({ where: { id: { in: ids } }, select: { id: true, thread: { select: { contextType: true, contextId: true } } } });
    const properties = await findThreadContextProperties(rows.map((row) => row.thread));
    return byId(rows, (row) => target(properties[row.thread.contextType]?.get(row.thread.contextId) ?? null));
  },
};

// 응답 한 건. 여기 적은 칸만 내보낸다(storagePath·uploadId·isLocked·다운로드 주소 없음).
// 등록자 이메일은 동명이인을 가리려고 보낸다(관리자는 회원 목록에서 이미 이메일을 본다).
export const toAdminDocumentResponse = (document, resolved) => ({
  id: document.id,
  documentType: document.type,
  fileName: document.fileName,
  mimeType: document.mimeType,
  sizeBytes: Number(document.sizeBytes),
  resourceType: document.resourceType,
  resourceId: document.resourceId,
  property: resolved?.property ?? null,
  link: resolved?.link ?? null,
  uploader: { id: document.uploader.id, name: document.uploader.name, email: document.uploader.email, role: document.uploader.role },
  createdAt: document.createdAt.toISOString(),
});

// from·until은 KST 날짜(그날 포함) → createdAt 범위.
const toCreatedAtWhere = (from, until) => {
  if (!from && !until) return undefined;
  return {
    ...(from && { gte: new Date(`${from}T00:00:00+09:00`) }),
    ...(until && { lt: new Date(`${addDaysToDateString(until, 1)}T00:00:00+09:00`) }),
  };
};

// 등록자 검색어는 회원 목록 검색과 같은 규칙(이메일·이름 부분 일치, 대소문자 무시).
export const toAdminDocumentWhere = ({ resourceTypes, uploaderId, uploaderQuery, from, until }) => ({
  deletedAt: null,
  resourceType: { in: resourceTypes ?? SUPPORTED_RESOURCE_TYPES },
  evidenceFor: { none: {} },
  ...(uploaderId && { uploaderId }),
  ...(uploaderQuery && {
    uploader: { OR: [{ email: { contains: uploaderQuery, mode: 'insensitive' } }, { name: { contains: uploaderQuery, mode: 'insensitive' } }] },
  }),
  ...(toCreatedAtWhere(from, until) && { createdAt: toCreatedAtWhere(from, until) }),
});

const resolveTargets = async (documents) => {
  const idsByType = new Map();
  for (const document of documents) {
    if (!idsByType.has(document.resourceType)) idsByType.set(document.resourceType, new Set());
    idsByType.get(document.resourceType).add(document.resourceId);
  }
  const entries = await Promise.all(
    // 지도에 없는 종류(새로 생겼는데 아직 안 넣은 것)는 목록을 막지 않고 호실·이동 대상만 null로 둔다. 키 일치는 테스트가 지킨다.
    [...idsByType].map(async ([type, ids]) => [type, (await PROPERTY_RESOLVERS[type]?.([...ids])) ?? new Map()]),
  );
  return new Map(entries);
};

export const findAdminDocuments = async (query) => {
  const { page, size } = query;
  const where = toAdminDocumentWhere(query);
  const [documents, total] = await prisma.$transaction([
    prisma.document.findMany({
      where,
      include: { uploader: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.document.count({ where }),
  ]);
  const targets = await resolveTargets(documents);
  return {
    items: documents.map((document) => toAdminDocumentResponse(document, targets.get(document.resourceType)?.get(document.resourceId))),
    meta: toPageMeta(page, size, total),
  };
};

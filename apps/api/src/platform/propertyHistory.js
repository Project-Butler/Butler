// 관리 로그 저장 경로와 시스템 기록용 공유 함수(계약 9장 appendPropertyHistory).
import { isOwnershipVerified } from './managementLogRules.js';
import { prisma } from './prismaClient.js';

const toDbDate = (dateString) => new Date(`${dateString}T00:00:00Z`);

// 직접 작성(POST)과 시스템 기록이 같이 쓰는 삽입. client: prisma 또는 트랜잭션의 tx.
export const insertPropertyLog = (
  client,
  { propertyId, ownershipId, authorId = null, scope, type, title, content = null, occurredOn, cost = null, source = {}, include },
) =>
  client.propertyLog.create({
    data: {
      propertyId,
      ownershipId,
      authorId,
      scope,
      type,
      title,
      content,
      occurredOn: toDbDate(occurredOn),
      cost,
      sourceFeature: source.feature ?? 'platform',
      sourceResourceType: source.resourceType ?? null,
      sourceResourceId: source.resourceId ?? null,
    },
    include,
  });

// 시스템 기록(티켓 완료 요약, 수선비 계산기 등). 작성자 없음. 소유 관계가 인증 상태면 호실 이력, 아니면 나만 보기.
// 호출자 책임: title·content에 임차인 이름·연락처와 계약 금액을 넣지 않는다(다음 소유자에게 넘어갈 수 있다). 수리 비용은 넣는다.
// source: { feature, resourceType, resourceId }. 본 작업과 같은 트랜잭션에 넣을 때 client로 tx를 넘긴다.
// attachmentDocumentIds는 문서 기능이 생기면 연결한다. TODO(documents)
export const appendPropertyHistory = async ({
  propertyId,
  ownershipId,
  type,
  title,
  content,
  occurredOn,
  cost,
  source,
  client = prisma,
}) => {
  const ownership = await client.ownership.findUnique({ where: { id: ownershipId } });
  return insertPropertyLog(client, {
    propertyId,
    ownershipId,
    scope: isOwnershipVerified(ownership) ? 'PROPERTY_HISTORY' : 'PRIVATE',
    type,
    title,
    content,
    occurredOn,
    cost,
    source,
  });
};

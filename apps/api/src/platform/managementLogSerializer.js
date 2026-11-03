// 관리 로그 응답 직렬화(DB 의존 없음). 목록·상세·쓰기 응답이 모두 이 함수를 쓴다(계약 5장).
import { toDateOnlyString } from './dateUtils.js';
import { canEditLog } from './managementLogRules.js';
import { toMoney } from './money.js';
import { toPropertySummary } from './propertySerializer.js';

// 응답을 만들려면 이 include가 있어야 한다.
export const MANAGEMENT_LOG_INCLUDE = {
  property: { include: { complex: true } },
  ownership: true,
  author: { select: { id: true, name: true, role: true } },
};

export const toManagementLogResponse = (log, user, now = new Date()) => ({
  id: log.id,
  propertyId: log.propertyId,
  property: toPropertySummary(log.property),
  scope: log.scope,
  type: log.type,
  title: log.title,
  content: log.content ?? null,
  occurredOn: toDateOnlyString(log.occurredOn),
  cost: toMoney(log.cost) ?? null,
  // 작성자 본인에게만 보인다(다른 소유자·운영자에게는 null).
  author: log.authorId === user.id ? log.author : null,
  source: {
    feature: log.sourceFeature,
    resourceType: log.sourceResourceType ?? null,
    resourceId: log.sourceResourceId ?? null,
  },
  // 문서 기능 전이라 항상 빈 배열(명세 D-03). TODO(documents)
  attachments: [],
  isReadOnly: !canEditLog(log, user, now),
  createdAt: log.createdAt.toISOString(),
  updatedAt: log.updatedAt.toISOString(),
});

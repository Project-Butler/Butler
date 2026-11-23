// 하우스 로그 응답 직렬화(DB 의존 없음). 목록·상세·쓰기 응답이 모두 이 함수를 쓴다(계약 5장).
import { toDateOnlyString } from './dateUtils.js';
import { toAttachmentResponse } from './documentAttachments.js';
import { canDeleteLog, canEditLog, isHideOnlyLog } from './managementLogRules.js';
import { toMoney } from './money.js';
import { toPropertySummary } from './propertySerializer.js';

// 응답을 만들려면 이 include가 있어야 한다(ownership.userId로 이전 소유자 기록을 가린다).
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
  room: log.room ?? null,
  // 작성자 본인에게만 보인다(다른 소유자·운영자에게는 null).
  author: log.authorId === user.id ? log.author : null,
  source: {
    feature: log.sourceFeature,
    resourceType: log.sourceResourceType ?? null,
    resourceId: log.sourceResourceId ?? null,
  },
  // 붙은 문서(숨기지 않은 것, 올린 순서). 행에 attachments를 붙여 넘긴다(documentAttachments.withAttachments). URL은 넣지 않는다.
  attachments: (log.attachments ?? []).map(toAttachmentResponse),
  isReadOnly: !canEditLog(log, user, now),
  isDeletable: canDeleteLog(log, user, now),
  // 삭제가 숨김인지(H-41): 매도 뒤 판 사람의 넘어간 호실 이력·요약. 지우면 내 화면에서만 사라진다("내 화면에서 삭제").
  isHideOnly: isHideOnlyLog(log, user),
  // 이전 소유자의 소유 관계에 붙은 기록(넘겨받은 호실 이력, 읽기 전용, H-30).
  isFromPreviousOwner: log.ownership.userId !== user.id,
  createdAt: log.createdAt.toISOString(),
  updatedAt: log.updatedAt.toISOString(),
});

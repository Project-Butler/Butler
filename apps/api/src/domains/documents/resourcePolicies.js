// 문서를 붙이는 리소스별 권한 확인. resourceType마다 하나씩 둔다.
// 지금은 MANAGEMENT_LOG·TICKET·THREAD_MESSAGE·CONTRACT를 구현했다. 나머지는 그 기능 담당이 같은 모양으로 추가한다.
//   canView(user, resourceId)          볼 수 있으면 true(못 보면 문서도 404로 숨긴다)
//   lockForWrite(tx, user, resourceId) 붙이기·지우기 전에 리소스를 잠그고 수정 가능한지 확인(안 되면 에러)
//   throwNotFound()                    연결할 리소스가 없을 때의 404
//   maxAttachments                     리소스 하나에 붙일 수 있는 문서 수
//   documentWhere(user, resourceId)    (선택) 리소스는 보여도 문서 일부만 보여 줄 때의 Prisma where 조각. 없으면 붙은 문서 전부
import { AppError } from '../../platform/AppError.js';
import { CONTRACT_RESOURCE, MANAGEMENT_LOG_RESOURCE, THREAD_MESSAGE_RESOURCE, TICKET_RESOURCE } from '../../platform/documentAttachments.js';
import { MAX_MESSAGE_ATTACHMENTS } from '../../platform/threadRules.js';
import { MAX_LOG_ATTACHMENTS, MAX_TICKET_ATTACHMENTS } from './fileRules.js';
import { contractDocumentPolicy } from './contractDocumentPolicy.js';
import { canViewManagementLog, lockWritableLog } from '../managementLogs/service.js';
import { canViewMessage, lockWritableMessage, throwMessageNotFound } from '../threads/service.js';
import { canViewTicket, lockWritableTicket, throwTicketNotFound } from '../tickets/service.js';

const POLICIES = {
  [MANAGEMENT_LOG_RESOURCE]: {
    canView: canViewManagementLog,
    lockForWrite: lockWritableLog,
    throwNotFound: () => {
      throw new AppError('MANAGEMENT_LOG_NOT_FOUND', 404, '관리 로그를 찾을 수 없습니다.');
    },
    maxAttachments: MAX_LOG_ATTACHMENTS,
  },
  [TICKET_RESOURCE]: {
    canView: canViewTicket,
    lockForWrite: lockWritableTicket,
    throwNotFound: throwTicketNotFound,
    maxAttachments: MAX_TICKET_ATTACHMENTS,
  },
  // 메시지 첨부는 보낼 때만 붙인다. 보낸 뒤에는 붙이거나 지울 수 없다(lockForWrite가 항상 422).
  [THREAD_MESSAGE_RESOURCE]: {
    canView: canViewMessage,
    lockForWrite: lockWritableMessage,
    throwNotFound: throwMessageNotFound,
    maxAttachments: MAX_MESSAGE_ATTACHMENTS,
  },
  // 임차인은 수락한 초대로 공유받은 문서만 본다(documentWhere).
  [CONTRACT_RESOURCE]: contractDocumentPolicy,
};

export const SUPPORTED_RESOURCE_TYPES = Object.keys(POLICIES);

export const getResourcePolicy = (resourceType) => POLICIES[resourceType] ?? null;

// 그 리소스 문서 중 이 사용자가 볼 수 있는 것의 where 조각. documentWhere가 없는 정책은 전부({}).
export const visibleDocumentWhere = async (policy, user, resourceId) => (policy.documentWhere ? policy.documentWhere(user, resourceId) : {});

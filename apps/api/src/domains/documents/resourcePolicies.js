// 문서를 붙이는 리소스별 권한 확인. resourceType마다 하나씩 둔다.
// 지금은 MANAGEMENT_LOG·TICKET을 구현했다. 나머지(계약 등)는 그 기능 담당이 같은 모양으로 추가한다.
//   canView(user, resourceId)          볼 수 있으면 true(못 보면 문서도 404로 숨긴다)
//   lockForWrite(tx, user, resourceId) 붙이기·지우기 전에 리소스를 잠그고 수정 가능한지 확인(안 되면 에러)
//   throwNotFound()                    연결할 리소스가 없을 때의 404
//   maxAttachments                     리소스 하나에 붙일 수 있는 문서 수
import { AppError } from '../../platform/AppError.js';
import { MANAGEMENT_LOG_RESOURCE, TICKET_RESOURCE } from '../../platform/documentAttachments.js';
import { MAX_LOG_ATTACHMENTS, MAX_TICKET_ATTACHMENTS } from './fileRules.js';
import { canViewManagementLog, lockWritableLog } from '../managementLogs/service.js';
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
};

export const SUPPORTED_RESOURCE_TYPES = Object.keys(POLICIES);

export const getResourcePolicy = (resourceType) => POLICIES[resourceType] ?? null;

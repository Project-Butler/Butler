// 문서를 붙이는 리소스별 권한 확인. resourceType마다 하나씩 둔다.
// 지금은 MANAGEMENT_LOG·CONTRACT를 구현했다. 나머지(티켓 등)는 그 기능 담당이 같은 모양으로 추가한다.
//   canView(user, resourceId)          리소스를 볼 수 있으면 true(못 보면 문서도 404로 숨긴다)
//   documentWhere(user, resourceId)    canView가 true일 때 그 리소스 문서 중 볼 수 있는 것의 Prisma where 조각({}이면 전부)
//   lockForWrite(tx, user, resourceId) 붙이기·지우기 전에 리소스를 잠그고 수정 가능한지 확인(안 되면 에러)
//   throwNotFound()                    연결할 리소스가 없을 때의 404
//   maxAttachments                     리소스 하나에 붙일 수 있는 문서 수
import { AppError } from '../../platform/AppError.js';
import { CONTRACT_RESOURCE, MANAGEMENT_LOG_RESOURCE } from '../../platform/documentAttachments.js';
import { MAX_LOG_ATTACHMENTS } from './fileRules.js';
import { contractDocumentPolicy } from './contractDocumentPolicy.js';
import { canViewManagementLog, lockWritableLog } from '../managementLogs/service.js';

const POLICIES = {
  [MANAGEMENT_LOG_RESOURCE]: {
    canView: canViewManagementLog,
    // 기록을 볼 수 있으면 붙은 문서도 전부 본다.
    documentWhere: async () => ({}),
    lockForWrite: lockWritableLog,
    throwNotFound: () => {
      throw new AppError('MANAGEMENT_LOG_NOT_FOUND', 404, '관리 로그를 찾을 수 없습니다.');
    },
    maxAttachments: MAX_LOG_ATTACHMENTS,
  },
  [CONTRACT_RESOURCE]: contractDocumentPolicy,
};

export const SUPPORTED_RESOURCE_TYPES = Object.keys(POLICIES);

export const getResourcePolicy = (resourceType) => POLICIES[resourceType] ?? null;

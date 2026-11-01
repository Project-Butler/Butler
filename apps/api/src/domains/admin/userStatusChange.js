// PATCH /admin/users/:userId/status에서 바꿀 수 없는 대상(api-contract.md 10장 USER_STATUS_CHANGE_NOT_ALLOWED).
// 자기 자신·ADMIN 계정을 정지하면 운영자가 콘솔에 못 들어오게 될 수 있고, 탈퇴 계정은 되살리지 않는다.
import { AppError } from '../../platform/AppError.js';

export const ADMIN_SETTABLE_STATUSES = ['ACTIVE', 'SUSPENDED'];

const notAllowed = (message) => new AppError('USER_STATUS_CHANGE_NOT_ALLOWED', 422, message);

export const assertUserStatusChangeAllowed = (actor, target) => {
  if (target.id === actor.id) throw notAllowed('자기 자신의 상태는 바꿀 수 없습니다.');
  if (target.role === 'ADMIN') throw notAllowed('운영자 계정의 상태는 바꿀 수 없습니다.');
  if (target.status === 'WITHDRAWN') throw notAllowed('탈퇴한 계정의 상태는 바꿀 수 없습니다.');
};

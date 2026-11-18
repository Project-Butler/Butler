import { AppError } from '../../platform/AppError.js';
import { isKnownNotificationType, NOTIFICATION_TYPES } from '../../platform/notify.js';
import { assertAllowedBody, throwIfInvalid } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import { findMyPreference, updateMyPreference } from './service.js';

const PATCH_FIELDS = ['webPushEnabled', 'mutedTypes'];

// mutedTypes는 등록한 알림 type만, 중복은 하나로 합친다.
export const parsePreferenceBody = (body) => {
  const input = body ?? {};
  assertAllowedBody(input, PATCH_FIELDS);
  if (Object.keys(input).length === 0) {
    throw new AppError('VALIDATION_ERROR', 400, '수정할 값이 없습니다.', [
      { field: 'body', reason: `${PATCH_FIELDS.join(', ')} 중 하나 이상이 필요합니다.` },
    ]);
  }
  const details = [];
  const data = {};
  if (input.webPushEnabled !== undefined) {
    if (typeof input.webPushEnabled === 'boolean') data.webPushEnabled = input.webPushEnabled;
    else details.push({ field: 'webPushEnabled', reason: 'true 또는 false여야 합니다.' });
  }
  if (input.mutedTypes !== undefined) {
    if (!Array.isArray(input.mutedTypes) || !input.mutedTypes.every(isKnownNotificationType)) {
      details.push({ field: 'mutedTypes', reason: `${Object.values(NOTIFICATION_TYPES).join(', ')} 중에서 고른 배열이어야 합니다.` });
    } else {
      data.mutedTypes = [...new Set(input.mutedTypes)];
    }
  }
  throwIfInvalid(details);
  return data;
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const getPreference = async (req, res, next) => {
  try {
    sendData(res, await findMyPreference(req.user));
  } catch (error) {
    next(error);
  }
};

export const patchPreference = async (req, res, next) => {
  try {
    sendData(res, await updateMyPreference(req.user, parsePreferenceBody(req.body)));
  } catch (error) {
    next(error);
  }
};

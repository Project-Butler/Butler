import {
  findPropertiesByOwnerId,
  findPropertyById,
  updatePropertyVerification,
} from './service.js';

export const getPropertyDetail = (req, res) => {
  const property = findPropertyById(req.params.id);

  if (!property) {
    return res.status(404).json({ error: 'NOT_FOUND', message: '매물을 찾을 수 없습니다.' });
  }

  return res.status(200).json(property);
};

export const getPropertyList = (req, res) => {
  const { ownerId } = req.query;
  const resolvedOwnerId = ownerId === 'me' ? req.user.id : ownerId;

  const items = findPropertiesByOwnerId(resolvedOwnerId).map(({ id, address, verificationStatus }) => ({
    id,
    address,
    verificationStatus,
  }));

  return res.status(200).json({ items });
};

export const patchPropertyVerification = (req, res) => {
  const { status, verifiedBy, evidence } = req.body ?? {};
  const property = updatePropertyVerification(req.params.propertyId, status);

  if (!property) {
    return res.status(404).json({ error: 'NOT_FOUND', message: '매물을 찾을 수 없습니다.' });
  }

  // evidence/verifiedBy는 B팀이 자유 정의한 값을 그대로 저장만 한다 (지금은 fixture라 로깅만).
  console.log('[properties] verification updated', { propertyId: property.id, verifiedBy, evidence });

  return res.status(200).json({
    propertyId: property.id,
    verificationStatus: property.verificationStatus,
    verifiedAt: new Date().toISOString(),
  });
};

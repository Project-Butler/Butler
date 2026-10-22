// api-contract.md 9장 플랫폼 공유 함수 getPropertySummary(propertyId).
// 피처 팀이 호실 정보를 응답에 넣을 때 HTTP 대신 이 함수를 쓴다.
import { prisma } from './prismaClient.js';
import { toPropertySummary } from './propertySerializer.js';
import { isUuid } from './uuid.js';

// 없거나 id 형식이 틀리면 null(PropertySummary가 아니라 존재 여부 판단은 호출하는 쪽 몫).
export const getPropertySummary = async (propertyId) => {
  if (!isUuid(propertyId)) return null;

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { complex: true },
  });
  return property ? toPropertySummary(property) : null;
};

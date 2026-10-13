// TODO(A팀, DB 연결 시 교체): 지금은 fixture 데이터. Prisma 연결 후 Property 테이블 조회/갱신으로 바꾼다.
// 응답 모양(필드명)은 Core Integration Contract 그대로 유지.
const FIXTURE_PROPERTIES = [
  { id: 'p-1', address: '서울시 강남구 테헤란로 123', ownerId: 'u-landlord-1', verificationStatus: 'verified' },
  { id: 'p-2', address: '서울시 마포구 월드컵북로 45', ownerId: 'u-landlord-1', verificationStatus: 'pending' },
];

export const findPropertyById = (id) => FIXTURE_PROPERTIES.find((property) => property.id === id) ?? null;

export const findPropertiesByOwnerId = (ownerId) =>
  FIXTURE_PROPERTIES.filter((property) => property.ownerId === ownerId);

export const updatePropertyVerification = (id, status) => {
  const property = findPropertyById(id);
  if (!property) return null;

  property.verificationStatus = status;
  return property;
};

// 단지 외부 키 별칭(complex_source_aliases) 공용 함수. resolve(service.js)와 재연결 스크립트
// (prisma/relinkComplexAliases.js)가 같이 쓴다. 별칭은 추가만 하고 다른 Complex로 옮기지 않는다.

// keys 중 이미 어느 Complex에 붙어 있는 키 → { sourceKey, complexId, complexCreatedAt }
// complexes.source_key만 있고 별칭 행이 없는 옛 단지도 함께 본다.
export const findKeyOwners = async (db, keys) => {
  const [aliases, legacy] = await Promise.all([
    db.complexSourceAlias.findMany({
      where: { sourceKey: { in: keys } },
      select: { sourceKey: true, complexId: true, complex: { select: { createdAt: true } } },
    }),
    db.complex.findMany({ where: { sourceKey: { in: keys } }, select: { id: true, sourceKey: true, createdAt: true } }),
  ]);
  const owners = new Map(
    legacy.map((complex) => [complex.sourceKey, { complexId: complex.id, complexCreatedAt: complex.createdAt }]),
  );
  for (const alias of aliases) {
    owners.set(alias.sourceKey, { complexId: alias.complexId, complexCreatedAt: alias.complex.createdAt });
  }
  return [...owners].map(([sourceKey, owner]) => ({ sourceKey, ...owner }));
};

// 키가 여러 Complex에 걸쳐 있으면 KAPT 별칭을 가진 Complex를 고른다(둘 이상이면 가장 먼저 만든 것).
// KAPT 쪽이 없으면 가장 먼저 만든 Complex. owners가 비어 있으면 null.
export const chooseOwnerComplexId = (owners) => {
  if (owners.length === 0) return null;
  const byAge = [...owners].sort(
    (a, b) => a.complexCreatedAt - b.complexCreatedAt || a.complexId.localeCompare(b.complexId),
  );
  const kaptOwner = byAge.find((owner) => owner.sourceKey.startsWith('KAPT:'));
  return (kaptOwner ?? byAge[0]).complexId;
};

// complexId에 keys를 별칭으로 붙인다. 이미 어디든 붙은 키는 건드리지 않는다(ON CONFLICT DO NOTHING이라
// 그사이 다른 요청이 같은 키를 붙여도 에러 없이 건너뛴다).
// 결과: { attached: 새로 붙인 수, conflicts: 다른 Complex에 이미 붙어 있던 키 [{ sourceKey, complexId }] }
export const attachAliases = async (db, complexId, keys) => {
  const owners = await findKeyOwners(db, keys);
  const conflicts = owners
    .filter((owner) => owner.complexId !== complexId)
    .map(({ sourceKey, complexId: ownerId }) => ({ sourceKey, complexId: ownerId }));
  // 이 Complex의 키는 다시 넣어도 건너뛰어진다(complexes.source_key만 있던 옛 단지는 이때 별칭 행이 생긴다).
  const otherKeys = new Set(conflicts.map((conflict) => conflict.sourceKey));
  const newKeys = [...new Set(keys)].filter((key) => !otherKeys.has(key));
  if (newKeys.length === 0) return { attached: 0, conflicts };

  const { count } = await db.complexSourceAlias.createMany({
    data: newKeys.map((sourceKey) => ({ sourceKey, complexId })),
    skipDuplicates: true,
  });
  return { attached: count, conflicts };
};

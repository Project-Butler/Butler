import { prisma } from '../../platform/prismaClient.js';

export const SORTABLE_FIELDS = ['createdAt', 'title', 'sourcePage'];
// Prisma는 nullable 컬럼에만 nulls 옵션을 받는다.
const NULLABLE_SORT_FIELDS = ['sourcePage'];

const buildOrderBy = ({ field, direction }) => [
  { [field]: NULLABLE_SORT_FIELDS.includes(field) ? { sort: direction, nulls: 'last' } : direction },
  // 같은 값끼리 순서가 페이지마다 바뀌지 않도록 id로 한 번 더 정렬한다.
  { id: 'asc' },
];

// 목록에는 본문(content)과 결과(outcome)를 빼고 보낸다.
const LIST_SELECT = {
  id: true,
  type: true,
  propertyKind: true,
  category: true,
  title: true,
  summary: true,
  keywords: true,
  sourceTitle: true,
  sourcePage: true,
};

const buildKeywordWhere = (keyword) => ({
  OR: [
    { title: { contains: keyword, mode: 'insensitive' } },
    { summary: { contains: keyword, mode: 'insensitive' } },
    { content: { contains: keyword, mode: 'insensitive' } },
    { outcome: { contains: keyword, mode: 'insensitive' } },
    { keywords: { has: keyword } },
  ],
});

export const findReferences = async ({ filters, keyword, page, size, orderBy }) => {
  const { propertyKind, ...exactFilters } = filters;
  const conditions = [exactFilters];
  // propertyKind가 null인 자료(FAQ 등)는 주택·상가 공통이라 어느 쪽으로 걸러도 함께 보여준다.
  if (propertyKind) conditions.push({ OR: [{ propertyKind }, { propertyKind: null }] });
  if (keyword) conditions.push(buildKeywordWhere(keyword));
  const where = { AND: conditions };

  const [items, total] = await prisma.$transaction([
    prisma.disputeReference.findMany({
      where,
      select: LIST_SELECT,
      orderBy: buildOrderBy(orderBy),
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.disputeReference.count({ where }),
  ]);

  return {
    items,
    meta: { page, size, total, hasNext: page * size < total },
  };
};

export const findReferenceById = async (referenceId) => {
  const reference = await prisma.disputeReference.findUnique({ where: { id: referenceId } });
  if (!reference) return null;

  return {
    ...reference,
    createdAt: reference.createdAt.toISOString(),
    updatedAt: reference.updatedAt.toISOString(),
  };
};

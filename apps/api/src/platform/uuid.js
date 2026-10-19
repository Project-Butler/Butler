// 경로 파라미터 id가 UUID 형식인지 검사한다.
// id 컬럼이 uuid 타입(@db.Uuid)이라 형식이 틀린 값으로 조회하면 Prisma가 P2023을 던져 500이 된다.
// 조회 전에 이 함수로 걸러서, 형식이 틀리면 없는 리소스와 똑같이 404 <리소스>_NOT_FOUND를 던진다.
// 버전 비트는 보지 않는다 — Postgres uuid 타입이 받는 8-4-4-4-12 hex 형식만 확인한다.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

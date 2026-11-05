// 커뮤니티가 쓰는 플랫폼 기능 중 아직 dev에 없는 것의 임시 구현.
// 플랫폼에 진짜 함수가 생기면 이 파일만 갈아끼운다. 커뮤니티의 다른 파일은 소유 관계·인증을
// 직접 조회하지 않고 항상 이 파일에서 가져다 쓴다(조인 쿼리를 서비스에 흩어 놓지 않는다).
// requireRegionMember 는 플랫폼 것(middlewares/requireRegionMember.js)을 그대로 내보낸다.
// listVerifiedLegalDongCodes 는 두지 않는다(부르는 곳이 없고, 플랫폼 pickVerifiedLegalDongCodes 가 같은 일을 한다).
import { AppError } from '../../platform/AppError.js';
import { compareNatural } from '../../platform/naturalSort.js';
import {
  computeOwnershipVerificationStatus,
  OWNERSHIP_REGION_SELECT,
  pickVerifiedLegalDongCodes,
} from '../../platform/ownershipStatus.js';
import { prisma } from '../../platform/prismaClient.js';
import { isUuid } from '../../platform/uuid.js';

// 인증이 유효한 활성 소유 관계(VERIFIED·endedAt null·만료 전)
// → { userId, complexId, legalDongCode, complexName, buildingNo, exclusiveArea, verifiedAt }. 호수(unitNo)는 꺼내지 않는다.
// exclusiveArea 는 Prisma Decimal 을 number 로(없으면 null).
// 저장값 VERIFIED로 후보를 좁히고, 만료는 computeOwnershipVerificationStatus()로 판정한다.
const findVerifiedOwnerships = async (where) => {
  const rows = await prisma.ownership.findMany({
    where: { ...where, endedAt: null, verificationStatus: 'VERIFIED' },
    select: {
      userId: true,
      verificationStatus: true,
      verifiedAt: true,
      verificationExpiresAt: true,
      property: {
        select: {
          complexId: true,
          buildingNo: true,
          exclusiveArea: true,
          complex: { select: { regionId: true, name: true } },
        },
      },
    },
  });

  const now = new Date();
  return rows
    .filter((row) => computeOwnershipVerificationStatus(row, now) === 'VERIFIED')
    .map((row) => ({
      userId: row.userId,
      complexId: row.property.complexId,
      legalDongCode: row.property.complex.regionId,
      complexName: row.property.complex.name,
      buildingNo: row.property.buildingNo,
      exclusiveArea: row.property.exclusiveArea == null ? null : Number(row.property.exclusiveArea),
      verifiedAt: row.verifiedAt,
    }));
};

// 플랫폼 것: api-contract.md 9장 requireRegionMember(getLegalDongCode). authGuard 뒤에 건다.
// 자격이 없으면 403 REGION_MEMBERSHIP_REQUIRED. 판정은 아래 isRegionMember 와 같은 함수(pickVerifiedLegalDongCodes)다.
export { requireRegionMember } from '../../middlewares/requireRegionMember.js';

// 플랫폼에 생기면 교체: api-contract.md 9장 isRegionMember(userId, legalDongCode). dev 에는 아직 함수가 없다.
// 이 사용자가 이 법정동에 유효한 권리자 인증을 보유했는가. 판정을 플랫폼 requireRegionMember 와 똑같이 하려고
// 그 미들웨어와 같은 조회(활성 소유 관계 + OWNERSHIP_REGION_SELECT)와 같은 판정(pickVerifiedLegalDongCodes)을 쓴다.
export const isRegionMember = async (userId, legalDongCode) => {
  if (!isUuid(userId) || typeof legalDongCode !== 'string') return false;
  const ownerships = await prisma.ownership.findMany({
    where: { userId, endedAt: null },
    select: OWNERSHIP_REGION_SELECT,
  });
  return pickVerifiedLegalDongCodes(ownerships).includes(legalDongCode);
};

// 플랫폼에 생기면 교체: api-contract.md 9장 notify({ userIds, type, title, body, link, related }).
// 알림 기능이 아직 없어서 아무것도 하지 않는다. 부르는 쪽은 진짜 함수처럼 await 해도 된다.
export const notify = async () => {};

// 인증 취소(REVOKED)는 운영자가 철회한 상태라 다시 인증할 수도 없다(권리자 인증이 VERIFICATION_REVOKED 로 막는다).
// 그래서 커뮤니티 읽기 자격 · 내 건물 목록에서는 "그 호실 없음" 과 같게 본다.
const NOT_REVOKED = { verificationStatus: { not: 'REVOKED' } };

// 플랫폼에 생기면 교체: 계약에 없는 함수. 커뮤니티 읽기 자격(인증 전 미리보기 포함).
// 이 사용자가 이 법정동에 활성 소유 관계(endedAt null, 인증 취소 아님)를 하나라도 가졌는가 — 미인증 · 만료여도 된다.
// 임차인 · 그 동네에 호실이 없는 임대인 · 인증 취소만 있는 임대인은 false.
export const hasActiveOwnershipInRegion = async (userId, legalDongCode) => {
  if (!isUuid(userId) || typeof legalDongCode !== 'string') return false;
  const count = await prisma.ownership.count({
    where: { userId, endedAt: null, ...NOT_REVOKED, property: { complex: { regionId: legalDongCode } } },
  });
  return count > 0;
};

// 플랫폼에 생기면 교체: 계약에 없는 미들웨어. 커뮤니티 읽기 경로(글 · 투표 목록 · 상세, 뉴스)에 authGuard 뒤에 건다.
// 그 법정동에 호실을 등록한 사람만 읽는다. 아니면 403 COMMUNITY_REGION_OWNER_REQUIRED.
// 본문 · 댓글 · 투표 선택지 · 결과는 여기를 지나도 인증이 있어야 응답에 들어간다(서비스가 잠근다).
export const requireRegionOwner = (getLegalDongCode) => async (req, res, next) => {
  try {
    if (!(await hasActiveOwnershipInRegion(req.user?.id, getLegalDongCode(req)))) {
      throw new AppError('COMMUNITY_REGION_OWNER_REQUIRED', 403, '이 동네에 호실을 등록한 임대인만 볼 수 있습니다.');
    }
    next();
  } catch (error) {
    next(error);
  }
};

// 건물 인증 상태의 우선순위: 유효한 인증이 하나라도 있으면 VERIFIED, 없고 만료가 있으면 EXPIRED, 그 밖(미인증)은 UNVERIFIED.
const BUILDING_STATUS_RANK = { VERIFIED: 0, EXPIRED: 1, UNVERIFIED: 2 };

// 플랫폼에 생기면 교체: 계약에 없는 함수. 내 건물 목록(GET /community/my-buildings)이 쓴다.
// 내 활성 소유 관계(인증 취소 제외, 미인증 · 만료 포함)를 단지별로 묶는다. 취소 호실만 있는 건물은 나오지 않고,
// 취소 호실은 호실 수 · 면적 · 인증할 호실(verifyPropertyId)에도 들어가지 않는다.
// Map(complexId → { unitCount, unitAreas, verificationStatus, verifyPropertyId }).
// - unitAreas: 시세 면적대(내 호실 점 · 처음 선택)용 전용면적(㎡, 저장값 그대로). 면적이 없는 호실은 뺀다. 동 · 호수는 내보내지 않는다
// - verificationStatus: 'VERIFIED' | 'EXPIRED' | 'UNVERIFIED' (판정은 computeOwnershipVerificationStatus)
// - verifyPropertyId: 인증이 필요한 건물이면 그 건물에서 인증할 호실 하나의 Property.id(만료 호실 먼저, 같으면 동 · 호 자연순), VERIFIED 면 null
export const summarizeMyActiveUnitsByComplex = async (userId) => {
  const units = new Map();
  if (!isUuid(userId)) return units;
  const rows = await prisma.ownership.findMany({
    where: { userId, endedAt: null, ...NOT_REVOKED },
    select: {
      verificationStatus: true,
      verificationExpiresAt: true,
      property: { select: { id: true, complexId: true, buildingNo: true, unitNo: true, exclusiveArea: true } },
    },
  });
  const now = new Date();
  const toBuildingStatus = (status) => (status === 'VERIFIED' || status === 'EXPIRED' ? status : 'UNVERIFIED');
  const candidates = new Map();
  for (const row of rows) {
    const { id, complexId, buildingNo, unitNo, exclusiveArea } = row.property;
    const status = toBuildingStatus(computeOwnershipVerificationStatus(row, now));
    if (!units.has(complexId)) units.set(complexId, { unitCount: 0, unitAreas: [], verificationStatus: 'UNVERIFIED', verifyPropertyId: null });
    const unit = units.get(complexId);
    unit.unitCount += 1;
    if (exclusiveArea != null) unit.unitAreas.push(Number(exclusiveArea));
    if (BUILDING_STATUS_RANK[status] < BUILDING_STATUS_RANK[unit.verificationStatus]) unit.verificationStatus = status;
    if (status !== 'VERIFIED') {
      if (!candidates.has(complexId)) candidates.set(complexId, []);
      candidates.get(complexId).push({ id, status, buildingNo, unitNo });
    }
  }
  for (const [complexId, unit] of units) {
    if (unit.verificationStatus === 'VERIFIED') continue;
    const [first] = (candidates.get(complexId) ?? []).sort(
      (a, b) =>
        BUILDING_STATUS_RANK[a.status] - BUILDING_STATUS_RANK[b.status] ||
        compareNatural(a.buildingNo, b.buildingNo) ||
        compareNatural(a.unitNo, b.unitNo),
    );
    unit.verifyPropertyId = first?.id ?? null;
  }
  return units;
};

// 플랫폼에 생기면 교체: 계약에 없는 함수. 내 건물 목록(GET /community/my-buildings)이 쓴다.
// 법정동마다 인증을 보유한 사람 수(여러 호실을 가져도 한 명). Map(legalDongCode → 사람 수).
export const countRegionMembers = async (legalDongCodes) => {
  const counts = new Map();
  if (legalDongCodes.length === 0) return counts;
  const ownerships = await findVerifiedOwnerships({
    property: { complex: { regionId: { in: legalDongCodes } } },
  });

  const members = new Map();
  for (const { legalDongCode, userId } of ownerships) {
    if (!members.has(legalDongCode)) members.set(legalDongCode, new Set());
    members.get(legalDongCode).add(userId);
  }
  for (const [legalDongCode, userIds] of members) counts.set(legalDongCode, userIds.size);
  return counts;
};

// 플랫폼에 생기면 교체: 계약에 없는 함수. 글·댓글 작성자 표기(authorLabel)가 쓴다.
// 이 사용자가 이 법정동의 이 단지에서 인증받은 호실 중 가장 먼저 인증한 것(같으면 동 자연순)의
// { complexName, buildingNo }. 단지명은 Complex.name(공식 이름)이다 — 임대인이 고치는 건물명이 아니다.
// 그 단지에 인증 호실이 없으면 null.
export const findAuthorUnit = async (userId, legalDongCode, complexId) => {
  if (!isUuid(userId) || !isUuid(complexId)) return null;
  const ownerships = await findVerifiedOwnerships({
    userId,
    property: { complexId, complex: { regionId: legalDongCode } },
  });
  const time = (value) => (value ? value.getTime() : Number.MAX_SAFE_INTEGER);
  const [first] = ownerships.sort(
    (a, b) => time(a.verifiedAt) - time(b.verifiedAt) || compareNatural(a.buildingNo, b.buildingNo),
  );
  return first ? { complexName: first.complexName, buildingNo: first.buildingNo } : null;
};

// 플랫폼에 생기면 교체: 계약에 없는 함수. 게시판 목록·상세가 글쓰기 버튼과 안내 띠를 고르는 데 쓴다.
// 이 법정동에서 이 사용자의 쓰기 자격 — 'VERIFIED'(쓸 수 있음) | 'EXPIRED'(인증이 있었지만 만료) | 'UNVERIFIED'.
// 유효한 인증이 하나라도 있으면 VERIFIED, 없고 만료된 인증만 있으면 EXPIRED, 그 밖(미인증·취소·소유 없음)은 UNVERIFIED.
export const getRegionVerificationStatus = async (userId, legalDongCode) => {
  if (!isUuid(userId) || typeof legalDongCode !== 'string') return 'UNVERIFIED';
  const rows = await prisma.ownership.findMany({
    where: { userId, endedAt: null, verificationStatus: 'VERIFIED', property: { complex: { regionId: legalDongCode } } },
    select: { verificationStatus: true, verificationExpiresAt: true },
  });
  const now = new Date();
  const statuses = rows.map((row) => computeOwnershipVerificationStatus(row, now));
  if (statuses.includes('VERIFIED')) return 'VERIFIED';
  return statuses.includes('EXPIRED') ? 'EXPIRED' : 'UNVERIFIED';
};

// 플랫폼에 생기면 교체: 계약에 없는 함수. 투표의 "우리 단지"(scope COMPLEX) 참여 자격.
// 이 사용자가 이 단지에 유효한 권리자 인증을 보유했는가. (플랫폼에 단지 단위 권한 확인 수단이 아직 없다 — 임시)
export const isComplexMember = async (userId, complexId) => {
  if (!isUuid(userId) || !isUuid(complexId)) return false;
  const ownerships = await findVerifiedOwnerships({ userId, property: { complexId } });
  return ownerships.length > 0;
};

// 플랫폼에 생기면 교체: 계약에 없는 함수. 투표 상세의 "N호실을 보유하고 계시지만 1표만 반영됩니다" 문구용.
// 범위(단지 또는 법정동) 안에서 이 사용자가 인증을 보유한 호실 수.
export const countMyVerifiedUnitsInScope = async (userId, { complexId, legalDongCode }) => {
  if (!isUuid(userId)) return 0;
  const property = complexId ? { complexId } : { complex: { regionId: legalDongCode } };
  return (await findVerifiedOwnerships({ userId, property })).length;
};

// 플랫폼에 생기면 교체: 계약에 없는 함수. 뉴스 수집 대상(그 뉴스를 볼 수 있는 사람이 한 명이라도 있는 동 — 아무도 없는 곳은 모으지 않는다).
// 기준은 커뮤니티 읽기 자격(hasActiveOwnershipInRegion)과 같다 — 활성 소유 관계(endedAt null, 인증 취소 아님)가 하나라도 있는
// 법정동 코드 전부(인증 전 · 만료 포함, 중복 없음, 오름차순). 사용자는 꺼내지 않는다.
// (11/05: 전에는 유효한 인증만 봐서, 11/04 부터 뉴스를 볼 수 있게 된 인증 전 임대인만 있는 구는 기사가 쌓이지 않았다)
export const listAllOwnedLegalDongCodes = async () => {
  const ownerships = await prisma.ownership.findMany({
    where: { endedAt: null, ...NOT_REVOKED },
    select: { property: { select: { complex: { select: { regionId: true } } } } },
  });
  return [...new Set(ownerships.map((o) => o.property.complex.regionId))].sort();
};

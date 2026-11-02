// api-contract.md 9장 requireRegionMember(getLegalDongCode). 그 법정동에 인증이 유효한 활성 소유 관계가 있어야 한다.
// JWT에 넣지 않고 요청마다 DB에서 계산해 만료·철회·종료가 다음 요청부터 반영된다. 판정은 /auth/me와 같은 함수다.
import { AppError } from '../platform/AppError.js';
import { OWNERSHIP_REGION_SELECT, pickVerifiedLegalDongCodes } from '../platform/ownershipStatus.js';
import { prisma } from '../platform/prismaClient.js';

export const requireRegionMember = (getLegalDongCode) => async (req, res, next) => {
  try {
    const legalDongCode = getLegalDongCode(req);
    const ownerships = req.user
      ? await prisma.ownership.findMany({ where: { userId: req.user.id, endedAt: null }, select: OWNERSHIP_REGION_SELECT })
      : [];
    if (!pickVerifiedLegalDongCodes(ownerships).includes(legalDongCode)) {
      throw new AppError('REGION_MEMBERSHIP_REQUIRED', 403, '이 지역의 인증된 소유자만 할 수 있습니다.');
    }
    next();
  } catch (error) {
    next(error);
  }
};

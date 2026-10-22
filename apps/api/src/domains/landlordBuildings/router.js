import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import {
  getLandlordBuilding,
  listLandlordBuildings,
  patchLandlordBuilding,
  postLandlordBuilding,
  removeLandlordBuilding,
} from './controller.js';

const router = Router();

// 임대인 건물 설정(명세 변경 C10). 본인 것만 다루고, 남의 것은 404로 숨긴다. ADMIN은 단건 조회만.
router.use(authGuard);

router.post('/', roleGuard(['LANDLORD']), generalRateLimiter, postLandlordBuilding);
router.get('/', roleGuard(['LANDLORD']), generalRateLimiter, listLandlordBuildings);
router.get('/:landlordBuildingId', roleGuard(['LANDLORD', 'ADMIN']), generalRateLimiter, getLandlordBuilding);
router.patch('/:landlordBuildingId', roleGuard(['LANDLORD']), generalRateLimiter, patchLandlordBuilding);
router.delete('/:landlordBuildingId', roleGuard(['LANDLORD']), generalRateLimiter, removeLandlordBuilding);

export default router;

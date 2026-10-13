import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getPropertyDetail, getPropertyList, patchPropertyVerification } from './controller.js';

const router = Router();

router.get('/', authGuard, getPropertyList);
router.get('/:id', authGuard, getPropertyDetail);
router.patch('/:propertyId/verification', authGuard, roleGuard(['landlord']), patchPropertyVerification);

export default router;

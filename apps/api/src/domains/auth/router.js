import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { login, logout, me, refresh } from './controller.js';

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authGuard, me);

export default router;

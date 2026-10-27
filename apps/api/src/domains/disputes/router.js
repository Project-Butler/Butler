import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter, rateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import {
  getChat,
  getReference,
  getRelatedReferences,
  listChats,
  listDisputeFaqs,
  listReferences,
  removeChat,
  sendChatMessage,
  startChat,
} from './controller.js';

const router = Router();

// 질문마다 Claude API 비용이 드니 일반 한도(1분 300회)와 별도로 질문 수를 막는다.
const chatQuestionRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyFn: (req) => `dispute-chat:${req.user.id}`,
  message: '상담 질문이 너무 많습니다. 1시간 후 다시 시도해주세요.',
});

// 분쟁 참고자료(조정사례·판례·가이드라인)는 로그인한 모든 역할이 읽을 수 있다.
router.use(authGuard, roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter);

router.get('/references', listReferences);
router.get('/references/:referenceId', getReference);
router.get('/references/:referenceId/related', getRelatedReferences);
router.get('/faqs', listDisputeFaqs);

// 상담 챗봇은 분쟁 당사자인 임대인·임차인만 쓴다. 대화는 본인 것만 보인다.
const chatRoleGuard = roleGuard(['LANDLORD', 'TENANT']);

router.get('/chats', chatRoleGuard, listChats);
router.post('/chats', chatRoleGuard, chatQuestionRateLimiter, startChat);
router.get('/chats/:chatId', chatRoleGuard, getChat);
router.post('/chats/:chatId/messages', chatRoleGuard, chatQuestionRateLimiter, sendChatMessage);
router.delete('/chats/:chatId', chatRoleGuard, removeChat);

export default router;

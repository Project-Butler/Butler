import './loadEnv.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { corsOptions } from './config/corsOptions.js';
import authRouter from './domains/auth/router.js';
import complexesRouter from './domains/complexes/router.js';
import disputesRouter from './domains/disputes/router.js';
import propertiesRouter from './domains/properties/router.js';
import { csrfGuard } from './middlewares/csrfGuard.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { requestId } from './platform/requestId.js';

const app = express();

// Vercel 엣지 프록시 한 단계 뒤에서 돌기 때문에 X-Forwarded-For의 마지막 값이 실제
// 클라이언트 IP다. 1보다 크게 잡으면 클라이언트가 보낸 X-Forwarded-For 값까지 믿게
// 돼서 req.ip(rateLimiter 키)를 위조할 수 있다.
app.set('trust proxy', 1);

app.use(requestId);
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(csrfGuard);

// api-contract.md 1장 "Base URL": /api/v1.
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/disputes', disputesRouter);
app.use('/api/v1/complexes', complexesRouter);
app.use('/api/v1/properties', propertiesRouter);

app.use(errorHandler);

export default app;

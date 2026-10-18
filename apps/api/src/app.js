import './loadEnv.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { corsOptions } from './config/corsOptions.js';
import authRouter from './domains/auth/router.js';
import disputesRouter from './domains/disputes/router.js';
import { csrfGuard } from './middlewares/csrfGuard.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { requestId } from './platform/requestId.js';

const app = express();

app.use(requestId);
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(csrfGuard);

// api-contract.md 1장 "Base URL": /api/v1.
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/disputes', disputesRouter);

// properties(호실·소유 관계) 도메인은 PropertyOwnership 기반으로 다시 설계돼서
// 이전 fixture를 삭제했다 — 9장 순서대로 복원 작업에서 새로 만든다.

app.use(errorHandler);

export default app;

import './loadEnv.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { corsOptions } from './config/corsOptions.js';
import activitiesRouter from './domains/activities/router.js';
import adminRouter from './domains/admin/router.js';
import authRouter from './domains/auth/router.js';
import communityRouter from './domains/community/router.js';
import communityCronRouter from './domains/community/cronRouter.js';
import complexesRouter from './domains/complexes/router.js';
import contractsRouter from './domains/contracts/router.js';
import managementLogsRouter from './domains/managementLogs/router.js';
import cronRouter from './domains/cron/router.js';
import dashboardRouter from './domains/dashboard/router.js';
import disputesRouter from './domains/disputes/router.js';
import documentsRouter, { filesRouter, storageContentRouter } from './domains/documents/router.js';
import jobsRouter from './domains/jobs/router.js';
import landlordBuildingsRouter from './domains/landlordBuildings/router.js';
import ownershipVerificationsRouter, { ownershipVerificationResultRouter } from './domains/ownershipVerifications/router.js';
import propertiesRouter from './domains/properties/router.js';
import propertyOwnershipsRouter from './domains/propertyOwnerships/router.js';
import ticketsRouter from './domains/tickets/router.js';
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
// 서명 검증에 원문 바이트가 필요해 express.json·csrfGuard보다 앞에 둔다.
app.use('/api/v1/ownership-verifications', ownershipVerificationResultRouter);
// 임시 로컬 저장소의 서명 경로(업로드 원문 20MB·다운로드). 쿠키·CSRF 헤더 대신 서명으로 판단한다.
app.use('/api/v1', storageContentRouter);
app.use(express.json());
app.use(cookieParser());
app.use(csrfGuard);

// api-contract.md 1장 "Base URL": /api/v1.
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/disputes', disputesRouter);
app.use('/api/v1/complexes', complexesRouter);
app.use('/api/v1/properties', propertiesRouter);
app.use('/api/v1/property-ownerships', propertyOwnershipsRouter);
app.use('/api/v1/ownership-verifications', ownershipVerificationsRouter);
app.use('/api/v1/contracts', contractsRouter);
app.use('/api/v1/management-logs', managementLogsRouter);
app.use('/api/v1/tickets', ticketsRouter);
app.use('/api/v1/files', filesRouter);
app.use('/api/v1/documents', documentsRouter);
app.use('/api/v1/landlord-buildings', landlordBuildingsRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/activities', activitiesRouter);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/community', communityRouter);

// Vercel Cron 전용(/api/cron/*). 계약 API가 아니라서 /api/v1 밖이고, 경로는 라우터 안에 있다.
app.use(cronRouter);
app.use(communityCronRouter);

app.use(errorHandler);

export default app;

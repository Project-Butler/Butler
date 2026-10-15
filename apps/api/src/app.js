import './loadEnv.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { corsOptions } from './config/corsOptions.js';
import authRouter from './domains/auth/router.js';
import propertiesRouter from './domains/properties/router.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { requestId } from './platform/requestId.js';

const app = express();

app.use(requestId);
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// TODO(7번): /api → /api/v1, csrfGuard 전역 연결은 이 두 라우터를 v1.0 모양으로
// 옮기는 작업과 함께 한다(axiosInstance.js의 X-Requested-With 헤더 추가와 묶어서).
app.use('/api/auth', authRouter);
app.use('/api/properties', propertiesRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Butler API listening on port ${PORT}`);
});

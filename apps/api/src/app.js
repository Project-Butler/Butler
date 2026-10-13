import './loadEnv.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { corsOptions } from './config/corsOptions.js';
import authRouter from './domains/auth/router.js';
import propertiesRouter from './domains/properties/router.js';

const app = express();

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/properties', propertiesRouter);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Butler API listening on port ${PORT}`);
});

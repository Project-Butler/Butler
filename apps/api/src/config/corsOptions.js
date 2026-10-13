const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const corsOptions = {
  origin(origin, callback) {
    // origin이 없는 요청(서버-투-서버, curl 등)은 허용
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS: ${origin}은 허용되지 않은 origin입니다.`));
  },
  credentials: true,
};

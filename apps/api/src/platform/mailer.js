// 메일 발송. SMTP(nodemailer)로 보낸다. 제공자에 묶이지 않아 Gmail 앱 비밀번호로 시험하다 나중에 다른 서비스로 바꿔도 코드는 그대로다.
// SMTP_HOST가 비어 있으면 로컬 개발용으로 메일 대신 서버 콘솔에 내용을 찍는다. 운영(NODE_ENV=production)에서는 503이다.
import nodemailer from 'nodemailer';
import { AppError } from './AppError.js';

let transporter;

const getTransporter = () => {
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    // 465는 처음부터 TLS, 587 등은 STARTTLS로 올린다.
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 8000,
    socketTimeout: 8000,
  });
  return transporter;
};

const sendMail = async ({ to, subject, text }) => {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('EMAIL_UNAVAILABLE', 503, '메일을 보낼 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
    console.info(`[mailer] SMTP_HOST가 비어 있어 메일을 보내지 않고 출력합니다.\n  받는 사람: ${to}\n  제목: ${subject}\n  ${text}`);
    return;
  }

  try {
    await getTransporter().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
  } catch (error) {
    console.error('[mailer] 메일 발송 실패:', error.message);
    throw new AppError('EMAIL_SEND_FAILED', 502, '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
};

// 테스트에서 mailer.send를 가짜로 바꿔 끼울 수 있게 객체로 내보낸다.
export const mailer = { send: sendMail };

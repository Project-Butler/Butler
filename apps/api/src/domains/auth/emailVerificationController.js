import { assertAllowedBody, throwIfInvalid } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import { confirmEmailVerification, sendEmailVerification } from './emailVerificationService.js';
import { validateEmail } from './registerValidation.js';

const CODE_PATTERN = /^\d{6}$/;

// POST /auth/email-verifications — 가입하려는 이메일로 인증번호를 보낸다.
export const requestEmailVerification = async (req, res, next) => {
  try {
    assertAllowedBody(req.body, ['email']);
    const details = [];
    const email = validateEmail(req.body.email, details);
    throwIfInvalid(details);

    sendData(res, await sendEmailVerification(email), { status: 200 });
  } catch (error) {
    next(error);
  }
};

// POST /auth/email-verifications/confirm — 번호가 맞으면 회원가입에 넘길 verificationToken을 준다.
export const confirmEmailVerificationCode = async (req, res, next) => {
  try {
    assertAllowedBody(req.body, ['email', 'code']);
    const details = [];
    const email = validateEmail(req.body.email, details);
    const { code } = req.body;
    if (typeof code !== 'string' || !CODE_PATTERN.test(code.trim())) {
      details.push({ field: 'code', reason: '인증번호는 숫자 6자리입니다.' });
    }
    throwIfInvalid(details);

    sendData(res, await confirmEmailVerification(email, code.trim()), { status: 200 });
  } catch (error) {
    next(error);
  }
};

// T10 웹 가입 (docs/plan.md 7장): 웹에서 가입이 완료되고 역할이 LANDLORD.  실패: 가입이 실패하거나 역할이 다름.
// 이메일 인증번호는 메일 대신 API 서버 콘솔에 찍힌다(SMTP_HOST 가 비어 있을 때). API 를 로그 파일로 띄우고
// 그 경로를 E2E_API_LOG 로 알려 줘야 읽을 수 있다. 알려 주지 않으면 "실행 불가"로 건너뛴다(통과로 치지 않는다).
//   예) E2E_API_LOG=/path/to/api.log npm run test:e2e -w apps/butler -- t10
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { API_URL } from './helpers.js';

const readCode = (logPath, email) => {
  const log = readFileSync(logPath, 'utf8');
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...log.matchAll(new RegExp(`받는 사람: ${escaped}[\\s\\S]*?인증번호는 (\\d{6}) 입니다`, 'g'))];
  return matches.at(-1)?.[1] ?? null;
};

test.describe('T10 웹 가입', () => {
  test.skip(!process.env.E2E_API_LOG, '실행 불가: E2E_API_LOG(API 서버 로그 파일 경로)가 없어 이메일 인증번호를 읽을 수 없다.');

  test('이메일 인증 → 가입을 마치면 임대인 홈이고, 서버가 보는 역할은 LANDLORD 다', async ({ page }) => {
    const email = `e2e-register-${Date.now()}@butler.test`;
    await page.goto('/register');

    await page.getByLabel(/^이름/).fill('가입시험');
    await page.getByLabel(/^이메일/).fill(email);
    await page.getByRole('button', { name: '인증번호 받기' }).click();

    const codeInput = page.getByLabel('인증번호', { exact: true });
    await expect(codeInput).toBeVisible();
    await expect.poll(() => readCode(process.env.E2E_API_LOG, email), { message: 'API 로그에서 인증번호를 찾지 못했다', timeout: 10_000 }).not.toBeNull();
    await codeInput.fill(readCode(process.env.E2E_API_LOG, email));
    await page.getByRole('button', { name: '확인', exact: true }).click();
    await expect(page.getByText('인증 완료')).toBeVisible();

    await page.getByLabel(/^비밀번호(?! 확인)/).fill('password123');
    await page.getByLabel(/^비밀번호 확인/).fill('password123');
    await page.getByLabel(/^생년월일/).fill('1990-01-15');
    await page.getByLabel(/이용약관에 동의/).check();
    await page.getByLabel(/개인정보 수집·이용에 동의/).check();
    await page.getByRole('button', { name: '회원가입', exact: true }).click();

    await expect(page).toHaveURL(/\/landlord\/home$/);
    await expect(page.getByText('버틀러의 자산').first()).toBeVisible();

    const me = await page.request.get(`${API_URL}/auth/me`);
    expect(me.ok()).toBe(true);
    const { data } = await me.json();
    expect(data.user.email).toBe(email);
    expect(data.user.role, '가입한 계정의 역할이 임대인이 아니다').toBe('LANDLORD');
  });
});

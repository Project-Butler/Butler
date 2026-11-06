// E2E 시작 전 확인과 세션 준비.
//  1) API 가 떠 있는지: 아니면 어떤 테스트도 의미가 없으니 이유를 밝히고 바로 멈춘다.
//  2) seed 계정으로 역할마다 한 번만 로그인해 storageState 를 저장한다(로그인 속도 제한 때문에 테스트마다 로그인하지 않는다).
import { mkdirSync } from 'node:fs';
import { request } from '@playwright/test';
import { ACCOUNTS, API_URL, AUTH_DIR, statePath } from './helpers.js';

export default async () => {
  mkdirSync(AUTH_DIR, { recursive: true });

  const probe = await request.newContext();
  const alive = await probe.get(`${API_URL}/auth/me`).then(
    (response) => response.status() === 401,
    () => false,
  );
  await probe.dispose();
  if (!alive) {
    throw new Error(`API(${API_URL})가 응답하지 않거나 예상과 다릅니다. Docker Postgres 와 API 를 먼저 띄우세요: npm run dev -w apps/api`);
  }

  for (const [role, account] of Object.entries(ACCOUNTS)) {
    const context = await request.newContext();
    const response = await context.post(`${API_URL}/auth/login`, {
      headers: { 'X-Requested-With': 'butler-web' },
      data: { email: account.email, password: account.password },
    });
    if (!response.ok()) {
      throw new Error(`seed 계정 ${account.email} 로그인 실패(HTTP ${response.status()}). \`prisma db seed\` 를 했는지, 로그인 속도 제한(10분 10회)에 걸리지 않았는지 확인하세요.`);
    }
    await context.storageState({ path: statePath(role) });
    await context.dispose();
  }
};

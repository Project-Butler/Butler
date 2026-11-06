// T6 소셜 오류 처리 (docs/plan.md 7장)
//   성공: /login?oauth_error=OAUTH_ROLE_NOT_ALLOWED 에서 안내가 나오고 주소에서 쿼리가 지워진다.
//         키가 없을 때 시작 버튼이 OAUTH_UNAVAILABLE 로 돌아온다.
//   실패: 어긋남.  실제 구글·카카오 로그인은 키가 없으면 "실행 불가" — 이 스펙은 외부 제공자까지 가지 않는다.
import { expect, test } from '@playwright/test';

test.describe('T6 소셜 로그인 오류 안내', () => {
  test('OAUTH_ROLE_NOT_ALLOWED: 안내 문구가 나오고 주소에서 쿼리가 지워진다', async ({ page }) => {
    await page.goto('/login?oauth_error=OAUTH_ROLE_NOT_ALLOWED');

    await expect(page.getByText('임대인 계정만 소셜 로그인을 사용할 수 있습니다.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(new URL(page.url()).search, '주소에 oauth_error 가 남았다').toBe('');
  });

  test('모르는 코드는 기본 문구를 보여 주고 코드 문자열은 노출하지 않는다', async ({ page }) => {
    await page.goto('/login?oauth_error=SOMETHING_NEW');

    await expect(page.getByText('소셜 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.')).toBeVisible();
    await expect(page.getByText('SOMETHING_NEW')).toHaveCount(0);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('안내가 나온 뒤에도 이메일 로그인 폼은 그대로 쓸 수 있다', async ({ page }) => {
    await page.goto('/login?oauth_error=OAUTH_DENIED');
    await expect(page.getByText('소셜 로그인을 취소했습니다')).toBeVisible();
    await expect(page.getByLabel('이메일')).toBeEditable();
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
  });
});

test.describe('T6 소셜 로그인 시작 (키가 없을 때)', () => {
  for (const [provider, linkName] of [['구글', '구글로 계속하기'], ['카카오', '카카오로 계속하기']]) {
    test(`${provider} 시작 링크 → 키가 없으면 OAUTH_UNAVAILABLE 안내로 돌아온다`, async ({ page }) => {
      // 키가 있는 API 라면 제공자 화면으로 나가므로, 그쪽 요청은 막아 외부로 나가지 않게 한다.
      await page.route(/accounts\.google\.com|kauth\.kakao\.com|kakao\.com\/oauth/, (route) => route.abort());
      await page.goto('/login');

      await page.getByRole('link', { name: linkName }).click();
      await page.waitForLoadState('load');
      await page.waitForTimeout(500);

      const url = page.url();
      test.skip(!url.startsWith('http://localhost:5173'), `이 API 에는 ${provider} 키가 있어 제공자 화면으로 나갔다(${url.slice(0, 60)}). 키를 비운 API 로 다시 돌려야 확인할 수 있다 → 실행 불가`);

      await expect(page.getByText('소셜 로그인을 아직 사용할 수 없습니다. 이메일로 로그인해주세요.')).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});

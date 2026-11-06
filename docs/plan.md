# #97 단일 앱 통합 계획

> 이슈: [#97](https://github.com/Project-Butler/Butler/issues/97) `refactor: 세 앱을 apps/butler 하나로 합치고 역할·화면 형태(웹·앱)별 화면 분기`
> 후속: [#98](https://github.com/Project-Butler/Butler/issues/98) `feat: 임대인 앱 화면 추가 (로그인·회원가입·홈·부동산 등록)` — #97 완료 후 진행
> 상태: 계획 확정, 구현 전. 이 문서가 `01-folder-structure.md`의 "목표 구조"의 근거다.

## 1. 목표

`apps/admin`, `apps/landlord`, `apps/tenant` 세 앱을 `apps/butler` 하나로 합친다. 로그인 화면은 하나이고, 로그인한 사용자의 **역할**과 접속한 **화면 형태(웹·앱)**에 따라 보여 주는 화면만 달라진다. 디자인 토큰은 한 벌을 같이 쓴다.

| | 웹 (사이드바 셸) | 앱 (상단 바 + 하단 탭 셸) |
|---|---|---|
| 관리자 | 관리자 웹 | 없음 (모바일에서도 웹 셸) |
| 임대인 | 지금 임대인 웹 (표 위주) | 임대인 앱 (Figma 모바일 화면, #98) |
| 임차인 | 없음 (PC에서도 앱 셸을 가운데 모바일 폭으로) | 임차인 앱 (이번에는 틀만) |

앱 화면은 웹 화면을 반응형으로 줄이는 것이 아니라 **따로 만든다.** 분기는 라우팅에서만 한다. 현재 임대인 웹은 표가 많아 웹 전용이고, 앱 전용 디자인은 Figma에 따로 있다.

## 2. 확정된 결정

| 항목 | 결정 |
|---|---|
| 역할 분기 | 사용자의 `role`(ADMIN·LANDLORD·TENANT)로 `/admin/*`, `/landlord/*`, `/tenant/*`를 고른다 |
| 화면 형태(surface) | **휴대폰 UA이거나, 터치 기기(`(pointer: coarse)`)이면서 폭이 768px 미만이면 앱**, 아니면 웹. 폭은 단독 기준으로 쓰지 않는다(PC에서 창을 줄여도 웹). UA는 `navigator.userAgentData.mobile`을 먼저 보고, 지원하지 않는 브라우저는 `navigator.userAgent`의 휴대폰 기기 단어로 판단한다. **페이지를 열 때마다 새로 판단하고 저장하지 않는다**(쿠키·localStorage 금지). 열어 둔 채 창 크기만 바꿔서는 바뀌지 않는다(입력 중인 폼 보호). `?surface=app\|web` 덮어쓰기는 개발 환경에서만 동작하고 배포 빌드에서는 무시한다 |
| 관리자 | 항상 웹 화면 |
| 임대인 | 웹은 지금 화면, 앱은 앱 셸. 같은 주소에 화면만 다르다 |
| 임차인 | 항상 앱 화면(PC에서는 가운데 모바일 폭). 이번에는 틀(홈 자리, 내 정보 자리 + 로그아웃)만 |
| 상태 관리 | 세션은 zustand, 서버 데이터는 tanstack query, 라우팅은 react-router-dom |
| PWA | 모두 제거 (`vite-plugin-pwa`, manifest, icons, `install/`, 설치 배너) |
| 배포 | 이번 범위가 아니다. 프론트 배포가 아직 없고, 다 끝나면 배포한 뒤 배포 환경에서 개발한다 |
| 테스트 도구 | Playwright를 설치해 검증하고, 설치·실행이 안 되면 Claude in Chrome |

### 이번 이슈에서 하지 않는 것

- Figma 임대인 모바일 화면 M01~M04 구현 → [#98](https://github.com/Project-Butler/Butler/issues/98)
- 임대인 앱의 나머지 화면과 하단 탭 구성(탭 4칸은 Figma IA 기준 임시), 임차인 실제 기능 화면, 앱용 권리자 인증 흐름
- Vercel 배포, 도메인, SPA rewrite

## 3. 주소

```
/                                  로그인 전 → /login, 로그인 후 → 역할 홈
/login · /register · /register/oauth   공통 (소셜 로그인 콜백이 돌아오는 주소도 그대로)
/admin/*      ADMIN      홈 /admin/dashboard
/landlord/*   LANDLORD   홈 /landlord/home
/tenant/*     TENANT     홈 /tenant/home
```

- 관리자와 임대인 양쪽에 있는 `/contracts`, `/contracts/:id`, `/settings`가 겹치지 않도록 역할 접두어를 붙인다.
- 다른 역할 주소로 들어오면 내 역할 홈으로 보낸다.
- 로그인 뒤 돌아갈 주소(`from`)는 내 역할 접두어로 시작할 때만 쓰고, 아니면 역할 홈으로 보낸다.
- 앱 화면이 아직 없는 임대인 주소는 앱 셸 안에 "준비 중"을 보여 준다. 표가 많은 웹 화면을 모바일에 그대로 보여 주지 않는다.

**임대인 앱 하단 탭**(Figma IA 기준, 웹과 같은 주소를 쓴다. 탭 구성은 나중에 다시 정한다)

| 탭 | 주소 | 이번 이슈 |
|---|---|---|
| 홈 | `/landlord/home` | 준비 중 (M03은 #98) |
| 내 자산 | `/landlord/buildings` | 준비 중 |
| 커뮤니티 | `/landlord/community` | 준비 중 |
| 내 정보 | `/landlord/settings` | 준비 중 + 로그아웃 |

## 4. 목표 폴더

```
apps/butler
┣ index.html · vite.config.js · vitest.config.js · tailwind/postcss/eslint 설정 · .env.example
┣ dispute-preview.html · dispute-chat.html   개발용 미리보기 (경로만 고침)
┣ test/                  지금 임대인 vitest 테스트와 앞으로 쓸 e2e
┗ src
  ┣ main.jsx             QueryClientProvider + BrowserRouter (각각 한 번)
  ┣ App.jsx              세션 복원 → 인증 화면 / 역할 라우트 (React.lazy)
  ┣ store/sessionStore.js   zustand: user, verifiedLegalDongCodes, login, logout, clearSession
  ┣ surface/             getSurface(), 개발용 덮어쓰기
  ┣ auth/                로그인·가입 화면 연결, 역할 홈, from 검증, RequireRole
  ┣ shared/              두 역할 이상이 쓰는 것만 (apiError.js, useGetContract.js …)
  ┣ admin/               지금 apps/admin/src
  ┣ landlord/web/        지금 apps/landlord/src
  ┣ landlord/app/        앱 셸, 준비 중 화면 (M01~M04는 #98)
  ┗ tenant/              앱 셸, 홈 자리, 내 정보 자리
packages/ui      MobileShell(TopBar, TabBar) 추가
packages/config  Figma Foundations와 비교해 없는 토큰만 추가 (기존 값은 덮어쓰지 않음)
packages/api-client  그대로
```

- `admin/`은 웹 한 종류뿐이고 `tenant/`는 앱 한 종류뿐이라 그 안을 `web/`·`app/`으로 나누지 않는다. 임대인만 같은 주소에 화면이 둘이라 나눈다. 나중에 다른 역할에도 두 형태가 생기면 그 역할 폴더 안에 `web/`·`app/`을 추가한다.
- 분기는 두 번이다. ① 역할로 `admin`·`landlord`·`tenant` 선택 ② 임대인이면 surface로 `web`·`app` 선택.

## 5. 겹침·충돌 방지 규칙

1. **설정**: vite, tailwind, postcss, eslint, vitest 설정은 하나씩만 둔다. `apps/admin`·`apps/tenant`의 설정 파일은 지운다. 포트는 5173, `.env`는 `apps/butler/.env` 하나.
2. **패키지**: 이름은 `@butler/butler`. 세 앱의 의존성을 합치고 zustand를 추가하며 `vite-plugin-pwa`는 뺀다. `package-lock.json`을 다시 만든다(CI가 `npm ci`를 쓴다).
3. **중복 파일**: 아래는 두 앱 소스를 직접 비교해 확인한 결과다.
   - 완전히 같음: `utils/apiError.js`, `index.css` → 한 벌만
   - 주석 한 줄만 다름: `hooks/useGetContract.js` → `shared/`에 한 벌
   - 이름만 같고 다른 화면: `pages/ContractDetailPage.jsx` → 역할 폴더에 따로
   - 앱마다 하나씩 필요: `App.jsx`, `main.jsx`, `routes.js`
4. **import 경계(eslint로 강제)**: `admin/`, `landlord/`, `tenant/`는 서로 import할 수 없고 `shared/`와 `packages/*`만 쓴다. 앱 안에서 axios를 직접 import할 수 없다(지금도 앱 코드에서 axios를 직접 import하는 곳은 없다).
5. **API 함수**: `packages/api-client`에만 둔다. API 서버 코드는 바꾸지 않고, `.env.example`의 `FRONTEND_ORIGINS` 예시에서 5174·5175만 지운다. `OAUTH_FRONTEND_URL`은 원래 5173이라 그대로.
6. **세션**: 지금 앱마다 따로 있는 `getMe` 결과를 zustand 스토어 하나로 모으고, 401 처리도 `clearSession` 하나로 한다.
7. **PWA 제거**: 개발 서버(5173)는 서비스워커를 등록한 적이 없다(`vite.config.js`에 `devOptions` 없음). 개발자 브라우저에 남은 서비스워커 문제는 생기지 않는다.

## 6. 진행 순서

| 단계 | 할 일 | 통과 조건 |
|---|---|---|
| 0 | **바꾸기 전 기준선**: 최신 dev에서 admin·landlord의 모든 경로(커뮤니티 포함) 스크린샷, 콘솔 오류, 실패한 요청 기록 | 기록 파일이 있고 원래 있던 오류가 따로 표시됨 |
| 1 | Playwright 설치·검증 | 아래 순서 |
| 2 | `git mv`만 하는 이동 커밋 | 모든 파일이 rename으로 잡힘 |
| 3 | 설정 통합, PWA 제거, lockfile | `npm ci`, lint, build 통과 |
| 4 | `shared/` 정리, 경계 lint 규칙 | 위반 0건 |
| 5 | 세션 스토어, surface, 역할 라우트, from 검증, lazy | T1~T6 통과(웹 기준) |
| 6 | 웹 회귀 확인 | 기준선과 같음 |
| 7 | 토큰 비교, MobileShell, "준비 중" 화면 | 탭 이동과 활성 표시가 맞음 |
| 8 | 임차인 앱 틀 | T2 임차인 항목 통과 |
| 9 | 전체 테스트 T0~T10 | **실패 0건** |
| 10 | 문서 갱신: 루트 README, `docs/01`, 메모리 | |

**이동 커밋을 따로 하는 이유**: 이동과 내용 수정이 한 커밋에 섞이면 git이 rename으로 알아보지 못해 다른 브랜치를 rebase할 때 변경이 새 경로로 따라가지 않는다. 이 커밋만으로는 빌드가 안 된다.

**1단계 Playwright 순서**
1. `@playwright/test`를 설치한다.
2. `npx playwright --version`이 실행되는지 확인한다.
3. 이미 받아 둔 Chromium(1243)과 버전이 맞는지 확인하고, 안 맞으면 `npx playwright install chromium`.
4. 빈 테스트 하나가 통과하는지 확인한다.
5. 설치 뒤에도 `npm ci`, lint, build가 그대로 통과하는지 확인한다.

하나라도 실패하면 Playwright는 쓰지 않고 Claude in Chrome으로 테스트한다.

## 7. 테스트

**전제**: Docker Postgres, API(4000), 앱(5173)을 띄우고 seed 계정(`landlord@butler.test`, `tenant@butler.test`, `admin@butler.test`, 비밀번호 `password123`)을 쓴다. 아래 성공 조건 중 **하나라도 못 지키면 실패**로 본다. 환경 때문에 돌릴 수 없는 항목(키가 비어 있어 503이 나는 경우 등)은 통과로 치지 않고 **"실행 불가"로 따로 보고**한다.

| ID | 성공 조건 | 실패 조건 |
|---|---|---|
| T0 정적 | `npm ci`, lint, build, vitest가 모두 exit 0이고 skip된 테스트가 0개. 옛 경로(`apps/landlord` 등), PWA, 설치 배너를 가리키는 곳이 0개. admin·landlord·tenant 청크가 따로 나뉨 | 하나라도 어긋남 |
| T1 로그인 전 접근 | 보호된 주소로 가면 모두 `/login`. 로그인하면 원래 가려던 곳으로 돌아감 | 보호된 화면이 잠깐이라도 그려짐, 이동이 반복됨 |
| T2 역할 × 화면 형태 | ADMIN: 웹 셸, 메뉴 화면이 기준선과 같음. LANDLORD desktop: 기존 경로가 기준선과 같음. LANDLORD mobile: 앱 셸 + 탭 4칸이 맞는 주소로 이동. TENANT: 앱 셸(desktop은 가운데 고정) | 셸이 틀림, 빈 화면, 기준선과 다름 |
| T3 역할 분리 | 다른 역할 주소로 가면 내 역할 홈으로 감. 그 사이 다른 역할의 API 요청과 청크 로드가 0건 | 1건이라도 있음 |
| T4 from 검증 | 로그아웃 상태로 `/admin/users`에 간 뒤 임대인으로 로그인하면 `/landlord/home` | `/admin/users`에 머묾 |
| T5 세션 | 새로고침해도 로그인 유지. 로그아웃하면 `/login`. 뒤로 가기를 해도 보호된 화면이 안 보임. 쿠키를 지우면 `/login`으로 감 | 어긋남 |
| T6 소셜 오류 처리 | `/login?oauth_error=OAUTH_ROLE_NOT_ALLOWED`에서 안내가 나오고 주소에서 쿼리가 지워짐. 키가 없을 때 시작 버튼이 `OAUTH_UNAVAILABLE`로 돌아옴 | 어긋남. 실제 구글·카카오 로그인은 키가 없으면 "실행 불가" |
| T7 surface | PC(마우스) 브라우저는 창을 767px 이하로 줄이고 새로고침해도 웹이 유지됨. 휴대폰 UA(Playwright `devices['iPhone …']`)는 앱. 터치 기기 + 데스크톱 UA + 폭 767px 이하는 앱, 같은 조건에서 폭 768px 이상은 웹. 열어 둔 채 창 크기만 바꾸면 셸이 그대로임. 휴대폰으로 연 뒤 PC로 열면 웹이 나옴. 배포 빌드에서 `?surface=`를 무시함 | 어긋남. 아이패드(UA가 Mac으로 나옴)처럼 에뮬레이션할 수 없는 기기는 "실행 불가"로 보고 |
| T8 콘솔·네트워크 | 기준선에 없던 콘솔 error와 처리 안 된 예외가 0건. 의도하지 않은 4xx/5xx가 0건 | 1건 이상 |
| T9 미리보기 | `/dispute-preview.html`, `/dispute-chat.html`이 열림 | 빈 화면이거나 오류 |
| T10 웹 가입 | 웹에서 가입이 완료되고 역할이 LANDLORD | 실패하거나 역할이 다름 |

가입·부동산 등록의 웹·앱 교차 테스트는 앱 화면이 생기는 #98에서 한다.

## 8. 알려진 위험과 대응

| 위험 | 원인 | 대응 |
|---|---|---|
| 팀원 로컬 환경이 깨짐 | 포트·`.env` 위치·폴더 이동 | 머지 전 공지: `apps/butler/.env` 하나, `npm run dev -w apps/butler`, 포트 5173 (이번 계획에서는 이슈·로컬 작업 조율을 하지 않기로 함) |
| 같은 주소 충돌 | `/contracts`, `/settings`가 양쪽에 있음 | 역할 접두어 |
| 로그인 뒤 엉뚱한 곳 | `from`에 다른 역할 주소가 들어올 수 있음 | 접두어 검사, 아니면 역할 홈 |
| 임차인이 관리자 코드까지 내려받음 | 빌드가 하나 | 역할별 `React.lazy` 코드 분할(T0에서 청크 분리 확인) |
| 관리자 화면 코드가 공개 주소에 올라감 | 앱이 하나 | 실제 보안 경계는 API `roleGuard(['ADMIN'])`이고 관리자 라우터 전체에 이미 걸려 있음 |
| 창 크기를 바꾸면 입력이 사라짐 | 셸이 바뀌며 화면을 새로 그림 | surface를 페이지를 열 때 한 번만 판단 |
| 소셜 가입이 항상 임대인 | API가 신규 소셜 가입자를 LANDLORD로 고정하고 기존 계정도 임대인만 허용 | 임차인 가입은 초대 기능 이후라 이번에는 그대로. 초대 기능을 만들 때 API 변경 필요 |
| 같은 이름 파일 | `useGetContract.js`, `ContractDetailPage.jsx` 등 | 5장 3번 |
| 한 브라우저에서 계정 하나만 로그인됨 | 세션 쿠키가 API 도메인 기준(원래도 같음) | 역할별 테스트는 시크릿 창이나 프로필을 나눠서 |
| 기준선이 바뀜 | 계획 중 원격 dev에 38커밋이 들어옴(B팀 커뮤니티 등) | 0단계에서 최신 dev 기준으로 기록 |

## 9. 배포할 때 필요한 것 (이번 범위 아님)

- Vercel 프론트 프로젝트 1개(Root Directory `apps/butler`)와 API 프로젝트 1개
- 모든 경로를 `index.html`로 보내는 SPA rewrite를 `apps/butler/vercel.json`에 추가(없으면 `/landlord/home` 새로고침이 404)
- 프론트와 API를 같은 상위 도메인에 둠(httpOnly 쿠키 전제). 예: `butler.app`, `api.butler.app`
- API의 `FRONTEND_ORIGINS`와 `OAUTH_FRONTEND_URL`에 프론트 주소 하나 설정
- 모노레포 workspace(`packages/*`)가 Vercel 빌드에서 설치되는지는 배포 로그로 확인(미확인)
- 관리자 주소를 따로 원하면 같은 프로젝트에 도메인을 하나 더 붙이면 된다(빌드는 그대로 하나)

## 10. 근거로 확인한 사실

- 앱 코드 규모: `apps/landlord`가 화면·훅·컴포넌트 대부분이고, `apps/admin`은 페이지 11개와 `RoleGuard(['ADMIN'])`, `apps/tenant`는 `App = () => null`이다.
- 세 앱 모두 `@butler/config`의 Tailwind preset과 `@butler/ui`·`@butler/api-client`를 쓴다.
- API `Role`은 `LANDLORD/TENANT/ADMIN`이고 라우터마다 `roleGuard`가 있다. 쿠키는 `httpOnly`, `sameSite: 'lax'`.
- Figma(`Butler 화면 구조 · IA · 와이어프레임`): 모바일 화면 M01 로그인, M02 회원가입, M03 임대인 홈, M04 부동산 등록, M17 등록 완료. IA의 하단 탭은 홈·내 자산·커뮤니티·내 정보 4칸. 관리자 콘솔은 "PC 전용 · PWA 없음 · AppShell 같은 틀". 임차인 화면은 Figma에 없다.
- Figma M02·M04와 API가 다른 곳(#98에서 반영): M02의 휴대폰 "인증번호 받기"는 API에 문자 인증이 없고, 생년월일·이메일 인증번호는 Figma에 없지만 가입에 필요하다. M04의 "유형"은 `postProperty` body에 대응하는 필드가 없다.
- 프로젝트에 `playwright` 패키지는 없고, 브라우저(chromium-1243)만 PC에 받아져 있다.

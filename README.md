# Butler

임대인·임차인을 위한 임대차 관리 서비스. 임대인·임차인·운영자용 프론트 3개와 백엔드 1개를 npm workspaces 모노레포로 관리한다.

| 워크스페이스 | 내용 | 로컬 주소 |
|---|---|---|
| `apps/api` | 백엔드 (Express, Prisma) | http://localhost:4000/api/v1 |
| `apps/landlord` | 임대인 (반응형 웹 + PWA) | http://localhost:5173 |
| `apps/tenant` | 임차인 (웹 우선, PWA) | http://localhost:5174 |
| `apps/admin` | 운영자 (데스크톱 웹) | http://localhost:5175 |
| `packages/ui` · `config` · `api-client` | 공유 컴포넌트 · 설정 · API 호출 | |

팀 작업 규칙은 `CLAUDE.md`에 있다.

## 준비물
- Node.js 20 이상 (CI가 20을 쓴다), npm (pnpm·yarn 쓰지 않음)
- Docker Desktop (로컬 PostgreSQL용)
- 에디터 줄바꿈은 LF로 저장한다

## 로컬 실행

### 1. 설치
```bash
git clone https://github.com/Project-Butler/Butler.git
cd Butler
npm install          # apps/api의 postinstall이 Prisma Client도 생성한다
```

### 2. 환경 변수
각 폴더의 `.env.example`을 `.env`로 복사한다. `.env`는 절대 커밋하지 않는다.
```bash
cp apps/api/.env.example apps/api/.env
cp apps/landlord/.env.example apps/landlord/.env
cp apps/tenant/.env.example apps/tenant/.env
cp apps/admin/.env.example apps/admin/.env
```
`apps/api/.env`의 `ACCESS_TOKEN_SECRET`·`REFRESH_TOKEN_SECRET`은 비어 있으니 아래 명령으로 하나씩 만들어 넣는다(두 값은 달라야 한다). 비워 두면 로그인이 안 된다.
```bash
node -e "console.info(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. 로컬 DB
```bash
docker compose up -d                                   # 레포 루트. postgres 16, localhost:5432
npm exec -w apps/api -- prisma migrate deploy          # 마이그레이션 적용
npm exec -w apps/api -- prisma db seed                 # 법정동 (샘플)
npm run seed:disputes -w apps/api                      # 분쟁 참고자료 59건
```
시드는 다시 실행해도 건수가 늘지 않는다.

### 4. 실행
```bash
npm run dev -w apps/api          # API
npm run dev -w apps/landlord     # 필요한 프론트만 (tenant, admin도 같은 방식)
```

### 5. 확인
fixture 계정으로 로그인한다. 비밀번호는 모두 `password123`이다.

| 역할 | 이메일 |
|---|---|
| LANDLORD | `landlord@butler.test` |
| TENANT | `tenant@butler.test` |
| ADMIN | `admin@butler.test` |

fixture 계정은 코드(`apps/api/src/domains/auth/service.js`)에만 있고 DB `users`에는 없다. 그래서 `users`를 참조하는 데이터는 아직 저장할 수 없다(Step 1에서 DB 로그인으로 바뀐다).

```bash
curl -c cookie.txt -H "Content-Type: application/json" -H "X-Requested-With: butler-web" \
  -d '{"email":"landlord@butler.test","password":"password123"}' http://localhost:4000/api/v1/auth/login
curl -b cookie.txt http://localhost:4000/api/v1/disputes/references   # meta.total 59
```

## DB 작업 규칙
- 개발은 각자 로컬 Docker DB에서 한다. 공유 DB(Supabase)를 가리키고 `prisma migrate dev`를 실행하지 않는다.
- 모델을 바꾸면 `apps/api`에서 `npx prisma migrate dev --name <변경내용>`으로 마이그레이션을 만들어 PR에 넣는다. 컬럼 이름·타입을 바꿀 때는 `--create-only`로 만든 SQL을 먼저 검토한다.
- 새 테이블을 만드는 마이그레이션에는 `ALTER TABLE "<테이블>" ENABLE ROW LEVEL SECURITY;`를 직접 추가한다.
- Supabase 반영(`prisma migrate deploy`)은 PR이 머지된 뒤 A팀이 한다. CI 자동 반영은 아직 없다.
- Supabase 대시보드에서 테이블을 직접 만들거나 고치지 않는다. `prisma db push`, `prisma migrate reset`도 쓰지 않는다.

## 브랜치 · 커밋 · PR
- `dev`에서 `feature/<팀>-<이슈번호>-<기능명>` 브랜치를 만들어 작업하고 `dev`로 PR을 올린다. `main`·`dev`에 직접 푸시하지 않는다.
- 커밋 메시지는 `type: subject` 또는 `YYMMDD type: subject` (예: `261019 feat: 계약 등록 폼 추가`).
- PR 전에 `console.log`를 지우고, `npm run lint --workspaces --if-present`와 `npm run build --workspaces --if-present`가 통과하는지 확인한다.

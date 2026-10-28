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
npm run seed:disputes -w apps/api                      # 분쟁 참고자료 1,236건 (사례집 59 + 판례 1,177)
```
시드는 다시 실행해도 건수가 늘지 않는다.

### 4. 실행
```bash
npm run dev -w apps/api          # API
npm run dev -w apps/landlord     # 필요한 프론트만 (tenant, admin도 같은 방식)
```

### 5. 확인
로컬 확인용 계정으로 로그인한다(`prisma db seed`가 만든다). 비밀번호는 모두 `password123`이다.

| 역할 | 이메일 |
|---|---|
| LANDLORD | `landlord@butler.test` |
| TENANT | `tenant@butler.test` |
| ADMIN | `admin@butler.test` |

이 계정들은 `prisma db seed`가 로컬 DB `users`에 넣는다(비밀번호는 bcrypt 해시로 저장). `DATABASE_URL`이 localhost가 아니면 넣지 않는다. 로그인은 `users` 테이블을 조회하므로 이 계정으로 만든 데이터도 저장된다.

```bash
curl -c cookie.txt -H "Content-Type: application/json" -H "X-Requested-With: butler-web" \
  -d '{"email":"landlord@butler.test","password":"password123"}' http://localhost:4000/api/v1/auth/login
curl -b cookie.txt http://localhost:4000/api/v1/disputes/references   # meta.total 1236
```

## DB 작업 규칙
- 개발은 각자 로컬 Docker DB에서 한다. 공유 DB(Supabase)를 가리키고 `prisma migrate dev`를 실행하지 않는다.
- 모델을 바꾸면 `apps/api`에서 `npx prisma migrate dev --name <변경내용>`으로 마이그레이션을 만들어 PR에 넣는다. 컬럼 이름·타입을 바꿀 때는 `--create-only`로 만든 SQL을 먼저 검토한다.
- 새 테이블을 만드는 마이그레이션에는 `ALTER TABLE "<테이블>" ENABLE ROW LEVEL SECURITY;`를 직접 추가한다.
- Supabase 반영(`prisma migrate deploy`)은 PR이 머지된 뒤 A팀이 한다. CI 자동 반영은 아직 없다.
- Supabase 대시보드에서 테이블을 직접 만들거나 고치지 않는다. `prisma db push`, `prisma migrate reset`도 쓰지 않는다.
- 대시보드에서 Exposed schemas에 public을 다시 넣지 않는다.
- data_api에는 테이블을 만들지 않는다


## 참고 데이터 처음 적재 (A팀만)
단지 검색의 K-apt 단지명·분양형태와 단지 `kaptCode`는 참고 데이터 표(`kapt_complexes`, `kapt_address_links`, `juso_building_links`)에서 나온다. 처음 한 번 A팀이 로컬에서 전체를 적재하고, 그 뒤로는 Vercel cron이 갱신한다(주간 `/api/cron/kapt-complexes` 목록 동기화, 매일 `/api/cron/reference-data` juso 변동·새 K-apt 단지).
- juso 쪽(`juso_building_links`)은 매일 변동만 받아 적용하므로 **분기 전체 재적재는 하지 않는다**. 전체분 적재(4번)는 처음 한 번, 사고 복구, 아래 드리프트 점검에서 권할 때만 한다.
- K-apt 기본정보 엑셀(2번)은 지금처럼 분기마다 한 번(1·4·7·10월 첫 주) 다시 넣는다.

### 준비 파일
- K-apt 공동주택 기본정보 엑셀(k-apt.go.kr › 단지정보 › 기본정보 내려받기, `.xlsx`). 추출일을 `--file-date`로 넘긴다.
- juso 건물DB 전체분 zip(business.juso.go.kr › 주소정보 다운로드 › 건물DB › 전체분, 예: `202609_건물DB_전체분.zip`, 약 150MB). 압축을 풀지 않아도 된다(풀어 둔 폴더도 됨). 레포에 넣지 않는다(`*.zip`은 `.gitignore`).

### 순서 (이 순서를 지킨다)
```bash
npm run sync:kapt -w apps/api                                                # 1. K-apt 단지 목록(약 2.2만 건)
npm run import:kapt-basis -w apps/api -- <엑셀.xlsx> --file-date 2026-10-16    # 2. 엑셀 → 기본정보 + 도로명 연결(KAPT_EXCEL)
npm run backfill:kapt-basis -w apps/api                                      # 3. 엑셀에 없는 단지(약 600곳) 기본정보 API — 하루 한도 4,500, 남으면 다음 날 다시
npm run import:juso-buildings -w apps/api -- <건물DB_전체분.zip>               # 4. juso 건물DB → 건물별 K-apt 연결(약 20만 행, 로컬 약 1분)
```
- 2·4번은 소스별 품질 게이트(읽은 줄 수, 연결률, 규칙별 비율, 지난 성공 대비)를 넘지 못하면 아무것도 바꾸지 않고 실패한다(`reference_data_imports.error`에 사유). 잘린 파일로는 기존 데이터를 지우지 않는다.
- 4번이 성공하면 juso 변동분 커서가 전체분 기준일로 옮겨지고, 매일 cron이 그다음 날부터 변동분을 적용한다. 4번은 변동분이 `RUNNING`·`PARTIAL`이면 시작하지 않는다(같은 잠금 키).
- 변동분을 손으로 적용할 때(cron을 켜기 전·받기가 안 될 때): `npm run apply:juso-changes -w apps/api -- <YYYYMMDD_dailynoticedata.zip>`. 커서 다음 날짜만 받는다(`--allow-gap`은 빠진 날짜를 알고 일부러 건너뛸 때만).
- 끝나면 `reference_data_imports`의 `stats`(연결률·규칙별 비율·행 수)를 확인한다.

### juso 매일 갱신: 건물DB 일변동분 → 공식 연계 전환
매일 cron이 받는 경로는 `JUSO_LINK_MODE`(apps/api `.env`·Vercel 환경 변수)로 정한다. 승인키 `JUSO_LINK_API_KEY`가 없으면 항상 `off`다.

| 모드 | 매일 cron이 하는 일 |
|---|---|
| `off` | 건물DB 일변동분(비공개 받기 주소, 키 없음)을 적용 |
| `shadow` (키가 있을 때 기본) | 일변동분을 적용하고, 같은 날 변동을 공식 연계(`update.juso.go.kr`, 승인키)로 **계획만** 해서 결과를 비교·기록(`reference_data_imports` source `JUSO_LINK_SHADOW`). 표에는 쓰지 않는다 |
| `apply` | 공식 연계만 적용(source `JUSO_LINK`). 일변동분은 돌지 않는다 |

- 날짜: 공식 연계 기준일 L의 자료 = 일변동분 stdde L-1의 자료.
- 공식 연계는 건물DB 파일이 아니라 상세주소 동 표시(100004) + 도로명주소 한글(100001) + 도로명(100005)을 받아 같은 매칭 규칙으로 맞춘다. 칸이 모자라 판단할 수 없는 건물은 **쓰지 않고**(unresolved, 기존 연결 유지) 기록만 남긴다. 판단 대상의 1%를 넘고 5건 이상이면 그날은 FAILED로 멈춘다.
- 하루 1번, 재시도 없음. 실패한 날짜는 성공 기록이 없으므로 다음 날 실행이 그 날짜부터 이어서 받는다(공식 연계는 한 번에 최대 10일치).
- **전환 절차**: `shadow`로 비교 기록이 쌓이면 확인한 뒤 아래를 실행하고, Vercel의 `JUSO_LINK_MODE`를 `apply`로 바꾼다. 7일 연속(설명되지 않는 차이 0건, unresolved 1% 미만)이 안 되면 `--force` 없이는 전환하지 않는다.
  ```bash
  npm run juso-link:cutover -w apps/api              # 공식 연계 기준점 = 일변동분 커서 + 1
  npm run juso-link:cutover -w apps/api -- --revert  # 되돌리기(일변동분 기준점 = 공식 연계 커서 - 1), 그 뒤 모드를 shadow·off로
  ```
- 손으로 하루치를 보거나 적용할 때: `npm run apply:juso-link -w apps/api -- --date YYYY-MM-DD [--dry-run]`(`--dry-run`은 쓰지 않고 계획만).
- **관리자 즉시 갱신**: 매일 cron을 기다리지 않고 지금 갱신하려면 `ADMIN` 계정으로 `POST /api/v1/admin/reference-data/juso/refresh`(본문 없음, `X-Requested-With: butler-web`)를 부른다. 지금 모드 그대로(apply면 공식 연계, off·shadow면 일변동분) 밀린 날짜를 적용하고 결과 요약을 돌려준다. 같은 날을 두 번 적용하지 않으며, 즉시 갱신이 이미 돌고 있으면 `409 REFERENCE_DATA_REFRESH_IN_PROGRESS`. 실행 기록은 `jobs`(type `JUSO_REFRESH_MANUAL`, 요청한 관리자).
- **드리프트 점검(월 1회, 선택)**: 공식 연계는 건물DB에만 있는 일부 변경(공동주택 여부만 바뀐 경우 등)을 못 본다. 그달 건물DB 전체분 zip으로 지금 표와 비교해서, 차이가 0.5%를 넘으면 4번(전체분 적재)으로 다시 맞춘다. 쓰기는 하지 않는다.
  ```bash
  npm run juso-link:drift -w apps/api -- <건물DB_전체분.zip>
  ```

### Supabase에 적재할 때 접속 규칙
- **세션 모드 pooler `aws-0-<region>.pooler.supabase.com:5432`**(IPv6가 되는 곳이면 직접 호스트 `db.<ref>.supabase.co:5432`)로, `postgres` 역할로 붙는다. **트랜잭션 모드 `:6543`은 쓰지 않는다**(적재는 몇 분짜리 트랜잭션 하나와 트랜잭션 잠금을 쓴다).
- 접속 주소는 **명령 한 번에만** 넣고 `.env`에 쓰지 않는다. 스크립트는 Prisma Client라서 `DATABASE_URL`을 읽으므로 두 변수에 같은 세션 모드 주소를 넣는다.
  ```powershell
  $env:DATABASE_URL='<Supabase 세션 모드 pooler 접속 문자열(aws-0-<region>.pooler.supabase.com:5432)>'; $env:DIRECT_URL=$env:DATABASE_URL
  npm run import:juso-buildings -w apps/api -- C:\data\202609_건물DB_전체분.zip
  Remove-Item Env:DATABASE_URL; Remove-Item Env:DIRECT_URL
  ```
- Supabase 적재는 마이그레이션 반영 뒤, 반영 전 `pg_dump`를 떠 둔다. 로컬 DB에서 먼저 같은 순서로 돌려 본다.

## 브랜치 · 커밋 · PR
- `dev`에서 `feature/<팀>-<이슈번호>-<기능명>` 브랜치를 만들어 작업하고 `dev`로 PR을 올린다. `main`·`dev`에 직접 푸시하지 않는다.
- 커밋 메시지는 `type: subject` 또는 `YYMMDD type: subject` (예: `261019 feat: 계약 등록 폼 추가`).
- PR 전에 `console.log`를 지우고, `npm run lint --workspaces --if-present`와 `npm run build --workspaces --if-present`가 통과하는지 확인한다.

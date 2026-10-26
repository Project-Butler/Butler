# 법정동코드 시딩 데이터

`legal-dong-codes.csv`는 전국 **동(洞·읍·면) 단위 법정동 5,067건**이다(2026-06-30 기준). 출처는 공공데이터포털 「국토교통부_전국 법정동」(https://www.data.go.kr/data/15063424/fileData.do, 연 1회 갱신)이다.

- **리(里) 단위는 뺀다** — 커뮤니티·단지 조회가 동 단위(`legalDongCode`가 `..00`으로 끝나는 코드)를 기준으로 한다. 리 지역 단지는 `complexes/resolve`가 읍·면 코드로 올려서 저장한다.
- 원본은 일반구를 "수원시장안구"처럼 붙여 쓰는데, 도로명주소 표기에 맞춰 "수원시 장안구"로 띄운다.

## 새 자료로 교체하는 방법

1. 위 페이지에서 원본 CSV를 브라우저로 내려받아 이 폴더에 둔다. **원본 파일은 커밋하지 않는다.**
2. 변환한다(헤더·일반구·세종·리 제외를 자체 확인하고, 실패하면 CSV를 쓰지 않는다):

```bash
node prisma/seed-data/convertLegalDongCodes.mjs "prisma/seed-data/국토교통부_전국 법정동_20260630.csv"
```

3. `npx prisma db seed`로 적용한다(`apps/api`에서). `prisma/seed.js`는 새 코드만 한 번에 넣고 이름이 바뀐 행만 고친다. 새 CSV에서 빠진(폐지된) 코드는 지우지 않고 `isActive=false`로만 바꾼다 — 단지가 FK로 참조할 수 있기 때문이다. 다시 실행해도 건수는 늘지 않는다.

# 분쟁 참고자료 시딩 데이터 (C팀)

`disputes.json`은 임대차 분쟁 해결사(`/disputes`)가 보여주는 조정사례·판례·FAQ다. `prisma/seedDisputes.js`가 읽어 `DisputeReference`(`dispute_references`) 테이블에 `sourceKey` 기준으로 upsert한다.

- 출처: 「2025 주택·상가건물 임대차분쟁 조정사례집」(국토교통부·한국부동산원·LH 발행, 2025. 12., 저작권 한국부동산원). 원본 PDF는 커밋하지 않는다.
- 원문을 옮기지 않고 요약했다. 항목마다 `sourceTitle`·`sourcePage`(책에 인쇄된 쪽수)로 출처를 남긴다.
- 사례집 고지: "무단복제를 금하며, 내용의 일부를 인용할 때에는 반드시 출처를 밝히시기 바랍니다." 서비스 화면에도 출처를 표시해야 한다.
- 분류
  - `type`: 조정사례 `CASE`, 사례 안에 인용된 판례 `PRECEDENT`, 조정 관련 FAQ `GUIDELINE`
  - `propertyKind`: `HOUSING`(주택), `COMMERCIAL`(상가), `null`(공통)
  - `category`: 사례집 목차의 분쟁 유형(주택·상가건물 임대차보호법 시행령의 조정 대상). FAQ는 `GENERAL`
- `sourceKey` 규칙: `casebook-2025-<H|C>-<장>-<번호>`(사례), `casebook-2025-P-<사건번호>`(판례), `casebook-2025-G-faq-<번호>`(FAQ). 이미 넣은 키를 바꾸면 중복 행이 생기므로 바꾸지 않는다.

적용: `npm run seed:disputes -w apps/api`(다시 실행해도 건수는 늘지 않는다).

## 판례 (precedents.json)

`precedents.json`은 국가법령정보센터에서 모은 임대차 판례 7,448건 중 **민사사건이면서 판결요지가 있고, 판시사항·판결요지에 임대차 관련 단어(임대·임차·보증금·차임·전세·권리금·월세)가 있는 1,177건**이다. 형식은 `disputes.json`과 같고, `seedDisputes.js`가 두 파일을 함께 넣는다.

- 출처: 국가법령정보센터(https://www.law.go.kr) 판례. `sourceTitle`은 "국가법령정보센터 판례", `sourcePage`는 `null`.
- 사람이 요약하지 않고 원문 필드를 규칙대로 옮겼다: 판시사항 → `summary`, 판결요지 → `content`, 참조조문 → `relatedLaws`, 법원·선고일·사건번호 → `caseNumber`. `outcome`은 `null`.
- `title`은 판시사항 중 임대차 관련 쟁점 하나(60자까지)이고, `category`·`propertyKind`·`keywords`는 사건명·판시사항의 단어로 자동 판정했다. 분류가 틀린 항목이 있을 수 있다.
- `sourceKey` 규칙: `lawgo-prec-<precSeq>`(국가법령정보센터 판례 일련번호).
- 변환 스크립트는 원본 자료와 함께 저장소 밖(`자료수집/_work/to_seed.py`)에 있다.

# K-apt 전국 단지 목록 (kapt_complexes)

단지 검색(`GET /complexes/search`)은 juso 결과를 K-apt 단지와 이름으로 맞춘다. 검색마다 K-apt 목록 API를 부르지 않도록 전국 목록을 `kapt_complexes` 테이블에 캐시한다. 파일로 커밋하지 않고 API에서 바로 받는다.

- 출처: 공공데이터포털 「국토교통부_공동주택 단지 목록제공 서비스」 `AptListService4/getTotalAptList4`(키는 `.env`의 `DATA_GO_KR_SERVICE_KEY`). 2026-10 기준 **22,338건**, 1,000건씩 23페이지를 차례로 받는다(전체 15초 안팎).
- `legalDongCode`는 K-apt `bjdCode` 원본이다(리 단위일 수 있음). 검색은 juso `admCd`와 그 읍면동 코드(`..00`)로 찾는다.
- 적용 방식은 법정동 시딩과 같다: 새 단지만 묶어서 넣고 바뀐 행만 고친다. 목록에서 빠진 단지는 지우지 않고 `isActive=false`로만 바꾼다. 받은 건수가 15,000건 미만이거나 지금 활성 단지의 80%에 못 미치면 아무것도 바꾸지 않고 실패로 끝낸다.
- 겹침 방지: `KAPT_COMPLEX_SYNC` 작업이 `PROCESSING`이고 `lockedAt`이 10분 안이면 새 실행은 아무것도 하지 않고 `{ skipped: true, reason: 'already-running' }`으로 끝난다(cron은 200). 10분 넘게 `PROCESSING`인 작업은 죽은 것으로 보고 `FAILED`(`error.reason = 'stale'`)로 바꾼 뒤 진행한다. 확인과 생성 사이 틈은 막지 않는다(주 1회라 감수).
- 비활성 상한: 한 번에 비활성으로 바꿀 단지가 2,000개를 넘으면 아무것도 쓰지 않고 실패로 끝낸다.
- cron 경로는 외부 API 실패·비정상 응답이면 `503 EXTERNAL_SERVICE_UNAVAILABLE`로 응답한다(DB 오류는 500).
- 실행 결과는 `jobs` 테이블에 `type = KAPT_COMPLEX_SYNC`로 남는다(`result`에 건수, 실패면 `error.reason`).
- 테이블이 비어 있으면(동기화 전 새 환경) 검색은 예전처럼 K-apt 목록 API를 직접 부른다. 서버 로그에 경고가 한 번 남는다.

## 처음 채우기 · 수동 갱신

```bash
npm run sync:kapt -w apps/api
```

로컬 DB는 마이그레이션 적용 후 각자 한 번 실행한다. 다시 실행해도 건수는 늘지 않는다.

## 주간 자동 갱신 (Vercel Cron)

`apps/api/vercel.json`의 `crons`가 **매주 월요일 03:00 KST**(`0 18 * * 0`, UTC 일요일 18:00)에 `GET /api/cron/kapt-complexes`를 부른다. 이 경로는 프론트용 계약 API(`/api/v1`)가 아니다.

- 인증: 요청의 `Authorization: Bearer <CRON_SECRET>`가 맞아야 한다(틀리면 401). `CRON_SECRET`이 없는 환경에서는 404로 숨긴다.
- 같은 파일에서 함수 최대 실행 시간을 60초(`functions."api/index.js".maxDuration`)로 늘렸다. 동기화가 10초 기본 제한을 넘기 때문이다.

A팀이 배포 쪽에서 할 일:

1. Vercel 프로젝트(apps/api) 환경 변수에 `CRON_SECRET`을 넣는다(Production). 값은 `node -e "console.info(require('crypto').randomBytes(32).toString('hex'))"`로 만든다. 없으면 cron 요청이 404로 끝난다.
2. 플랜에서 `maxDuration` 60초가 허용되는지, 배포 후 Vercel 대시보드 Cron Jobs에 작업이 보이는지 확인한다.
3. (권장) 함수 리전을 서울 `icn1`로 맞추는 것을 검토한다. 기본 리전(미국)에서는 Supabase·data.go.kr까지 왕복이 길어 동기화가 느려진다. `vercel.json`의 `regions`로 지정하며, 지금은 바꾸지 않았다.
4. PR이 머지된 뒤 Supabase에 `prisma migrate deploy`로 `add_kapt_complexes`를 반영하고, 한 번 채운다 — cron을 수동 실행(대시보드 Cron Jobs → Run)하거나 다음 월요일을 기다린다.

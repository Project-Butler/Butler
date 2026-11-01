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

`precedents.json`은 국가법령정보센터에서 모은 임대차 판례 7,448건 중 **민사사건이면서 판결요지가 있고, 판시사항·판결요지에 임대차 관련 단어(임대·임차·보증금·차임·전세·권리금·월세)가 있는 1,177건에서, 같은 판례가 판례 일련번호만 달리 두 번 등록된 25건을 뺀 1,152건**이다(일련번호가 작은 쪽을 남김). 형식은 `disputes.json`과 같고, `seedDisputes.js`가 두 파일을 함께 넣는다.

- 출처: 국가법령정보센터(https://www.law.go.kr) 판례. `sourceTitle`은 "국가법령정보센터 판례", `sourcePage`는 `null`.
- 사람이 요약하지 않고 원문 필드를 규칙대로 옮겼다: 판시사항 → `summary`, 판결요지 → `content`, 참조조문 → `relatedLaws`, 법원·선고일·사건번호 → `caseNumber`. `outcome`은 `null`.
- `title`은 판시사항 중 임대차 관련 쟁점 하나(60자까지)이고, `category`·`propertyKind`·`keywords`는 사건명·판시사항의 단어로 자동 판정했다. 분류가 틀린 항목이 있을 수 있다.
- `sourceKey` 규칙: `lawgo-prec-<precSeq>`(국가법령정보센터 판례 일련번호).
- 변환 스크립트는 원본 자료와 함께 저장소 밖(`자료수집/_work/to_seed.py`)에 있다.

## 판례 전체 (precedents-all.json)

`precedents-all.json`은 위 7,448건을 거르지 않고 같은 형식·규칙으로 옮긴 **7,341건**이다(일련번호만 다른 같은 판례 107건을 뺌). 일반 검색(`GET /disputes/references?q=`)에서 판례를 전부 찾게 하려고 만들었다.

- 시드는 `precedents.json` 대신 이 파일을 넣는다(`disputeSeedFiles.js`의 `SEED_JSON_PATHS`). `precedents.json`의 1,152건은 이 파일에 같은 `sourceKey`·같은 값으로 들어 있어 DB에 두 번 들어가지 않는다.
- 임베딩(`embed:disputes`)은 `precedents.json`에 있는 판례만 만든다(`CHATBOT_JSON_PATHS`). 챗봇·상세 "관련 자료"는 임베딩이 있는 자료만 읽으므로, 나머지 판례는 일반 검색에만 걸린다.
- `content`는 판결요지 → 없으면 판시사항 → 없으면 전문 앞부분(【이유】부터 2,000자). `summary`는 판시사항 → 판결요지 → 사건명. 행정·형사 사건과 판결요지 없는 하급심도 들어 있다.
- 변환 스크립트: `자료수집/_work/to_seed_all.py`(`to_seed.py`의 규칙을 그대로 쓴다).

## 대한법률구조공단 조정사례집 (klac-casebooks.json)

`klac-casebooks.json`은 대한법률구조공단 주택·상가건물 임대차분쟁조정위원회가 펴낸 조정사례집 3권의 조정사례 112건이다(`type: CASE`). `disputes.json`(한국부동산원 사례집)과 사례가 겹치지 않는다.

| 사례집 | 발행 | 건수 |
|---|---|---|
| 2025년 주택 및 상가건물임대차분쟁 조정사례집 | 2025. 9. | 30 (주택 17, 상가 13) |
| 2023년 주택 및 상가건물임대차분쟁 조정사례집 | 2023. 8. | 40 (주택 28, 상가 12) |
| 2018년 주택임대차분쟁 조정사례집 | 2018. 5. | 42 (주택) |

- 출처: https://www.hldcc.or.kr/hp/li/arrCaseList.do (조정사례 게시판). 원본 PDF·HWP는 커밋하지 않는다.
- `disputes.json`처럼 원문을 옮기지 않고 요약했다: `content`는 `[사실관계] [임차인 주장] [임대인 주장] [쟁점] [검토]`, 조정 결과는 `outcome`. `sourcePage`는 책에 인쇄된 쪽수.
- `category`는 `disputes.json`과 달리 책 목차가 아니라 사례의 주된 쟁점으로 정했다(예: 실거주 갱신거절 후 손해배상 청구는 책에서 '갱신 및 종료' 장이지만 `DAMAGES`).
- 2018년판은 2020년 개정(계약갱신요구권, 갱신거절 통지기간 2개월 등) 전 사례다. 해당 사례 본문에 '당시 법 기준'을 적어 두었다.
- 각 책의 FAQ는 `disputes.json`의 FAQ와 겹쳐 넣지 않았고, 책에 인용된 판례는 `precedents.json`과 겹쳐 따로 넣지 않았다.
- `sourceKey` 규칙: `klac-<연도>-<H|C>-<번호>`.

## 법령 (law-articles.json)

`law-articles.json`은 국가법령정보센터 현행 법령의 조문 130개다. 조문 하나가 항목 하나다.

| 법령 | 조문 수 |
|---|---|
| 주택임대차보호법 / 시행령 | 32 / 19 |
| 상가건물 임대차보호법 / 시행령 | 31 / 12 |
| 민법 임대차 조항(제618조~제654조) | 36 |

- 법령은 저작권법 제7조의 보호받지 않는 저작물이라 `content`에 조문 전문을 넣었다(개정 이력 표시 `<개정 …>`만 지움). `summary`는 첫 항 첫 문장, `title`은 `주택임대차보호법 제6조의3(계약갱신 요구 등)` 형식.
- 삭제된 조문과 위원회 운영·행정 조문(위원 임기·수당, 사무국, 고유식별정보 처리 등)은 뺐다. 분쟁조정 신청·절차·효력 조문은 남겼다.
- `type`은 DB에 법령 유형이 없어 `GUIDELINE`으로 넣었다. 법령 유형을 추가하면 변환 스크립트의 `TYPE`만 바꿔 다시 만든다.
- `sourceTitle`에 법령명과 시행일을 적는다(예: `주택임대차보호법 [시행 2026. 1. 2.] (국가법령정보센터)`). 법이 개정되면 다시 수집해 갱신한다.
- `sourceKey` 규칙: `law-<hlpa|hlpa-dec|clpa|clpa-dec|civil>-<조>[-<의>]` (예: `law-hlpa-6-3`).
- 수집·변환 스크립트는 저장소 밖(`자료수집/_work/collect_laws.py`, `laws_to_seed.py`)에 있다.

## 서울시 가이드북 (seoul-guidebook.json)

`seoul-guidebook.json`은 서울특별시 「2020.7.31. 개정 주택임대차보호법 가이드북」(2020. 12.)에서 옮긴 30건이다(모두 주택).

| 구분 | `type` | 건수 |
|---|---|---|
| 세입자편·집주인편 문답 30개 중 겹치는 질문을 합친 것 | `GUIDELINE` | 17 |
| 서울시 주요상담 사례 10건 중 문답과 겹치지 않는 것 | `GUIDELINE` | 6 |
| 주택임대차분쟁조정 사례 | `CASE` | 7 |

- 출처: https://news.seoul.go.kr/citybuild/archives/511154 . 원본 PDF는 커밋하지 않는다. `sourcePage`는 책에 인쇄된 쪽수.
- 원문을 옮기지 않고 요약했다. 만화 부분과 책에 실린 2020년 법 전문은 넣지 않았다(법령은 `law-articles.json`의 현행본을 쓴다).
- 2020년 개정 직후 해설이라 지금과 다른 부분은 본문에 '※ 2020년 자료 기준'으로 적었다: 갱신요구 기한(현재는 대부분 만료 2개월 전), 전월세 전환율(당시 기준금리 0.5% 기준 2.5%), 기관 이름(한국감정원 → 한국부동산원).
- `sourceKey` 규칙: `seoul-2020-<faq|qa|case>-<번호>`.

## 상담사례집 (counsel-casebooks.json)

`counsel-casebooks.json`은 임대차 상담 문답 211건이다(`type: GUIDELINE`, 상가 156 · 주택 55).

| 사례집 | 발행 | 건수 |
|---|---|---|
| 2023 상가임대차 상담사례집 | 서울특별시, 2023 | 133 (상가) |
| 2025 주택 및 상가건물 임대차 상담사례집 | 국토교통부·한국부동산원, 2025. 12. | 73 (주택 50, 상가 23) |
| 2024 주택임대차 상담사례집 | 한국부동산원, 2024 | 5 (주택, 2025년판에 없는 것만) |

- 출처: 서울시 민생경제안심센터 자료실(https://sftc.seoul.go.kr/fe/bbs/NR_view.do?bbsCd=2&bbsSeq=419), 한국부동산원 임대차분쟁조정위원회 공지사항(https://adrhome.reb.or.kr). 원본 PDF는 커밋하지 않는다. `sourcePage`는 책에 인쇄된 쪽수.
- 원문을 옮기지 않고 요약했다: `content`는 `[질의] [답변]`(`seoul-guidebook.json`의 상담 문답과 같은 형식), `outcome`은 `null`. 부동산원 사례집은 "무단복제를 금합니다" 고지가 있다.
- `disputes.json`(부동산원 **조정**사례집)과는 다른 책(**상담**사례집)이라 사례가 겹치지 않는다. 2024년판은 질문 대부분이 2025년판에 다시 실려, 답변이 다른 5건만 넣었다.
- 책 기준 시점과 지금이 다를 수 있는 부분(전월세 전환율 계산의 기준금리 등)은 본문에 '※ 2024년 자료 기준'처럼 적었다. 책의 인쇄 오류(서울시 8-1 본문이 7-4와 같음, 부동산원 상가 6-3 판례 번호)도 본문 끝에 ※로 적었다.
- `sourceKey` 규칙: `<seoul-2023|reb-2025|reb-2024>-counsel-<H|C>-<장>-<번호>` (예: `reb-2025-counsel-C-5-02`).
- 분할·병합 스크립트는 저장소 밖(`자료수집/_work/split_counsel.py`, `merge_counsel.py`, `counsel_batches/`)에 있다.

## 국토부 조정사례집 (molit-casebook.json)

`molit-casebook.json`은 「2022 주택임대차분쟁 조정사례집」(국토교통부, 2022. 12.)의 58건이다(모두 주택).

| 구분 | `type` | 건수 |
|---|---|---|
| 주요 조정사례 | `CASE` | 26 |
| 짧은 조정사례 (장 끝 '※ … 조정사례' 목록) | `CASE` | 13 |
| 주요 상담사례 | `GUIDELINE` | 19 |

- 출처: 국토교통부 발간자료(발간번호 11-1613000-003307-01). 원본 PDF는 커밋하지 않는다. `sourcePage`는 책에 인쇄된 쪽수.
- PDF 글자가 외곽선이라 텍스트를 뽑을 수 없어 OCR(Windows 내장 OCR)로 읽었다. 요약의 금액·연도는 OCR 원문과 자동 대조했고, 오인식이 의심되는 곳(이자율, 두 단 표)은 쪽 이미지로 확인했다.
- 2021년판(국토교통부·법무부)의 사례는 모두 2022년판에 다시 실려 2022년판만 넣었다. 책에 같은 사례가 두 번 실린 2건(실거주 갱신거절 사례3, 계약갱신요구권 행사 여부 사례)은 한 번만 넣었다.
- 조정사례는 `klac-casebooks.json`처럼 요약했다: `content`는 `[사실관계] [임차인 주장] [임대인 주장] [쟁점] [검토]`(짧은 사례는 `[사실관계] [검토]`), 조정 결과는 `outcome`. 상담사례는 `counsel-casebooks.json`과 같은 `[질의] [답변]`.
- `category`는 책 목차가 아니라 사례의 주된 쟁점으로 정했다. 책에 인용된 판례는 따로 넣지 않았다.
- 소액임차인 최우선변제 금액(상담사례 qa-17)은 책 발간 당시 '2023년 시행 예정'이던 현행 금액으로 적었다.
- `disputes.json`(부동산원 2025 조정사례집)과는 본문 대조로, `counsel-casebooks.json` 등과는 제목·주제 대조로 겹치는 사례가 없음을 확인했다.
- `sourceKey` 규칙: 조정사례 `molit-2022-H-<번호>`, 짧은 사례 `molit-2022-H-s<장>-<번호>`, 상담사례 `molit-2022-counsel-H-<번호>`.
- OCR·분할·병합 스크립트는 저장소 밖(`자료수집/_work/ocr_win.ps1`, `split_molit.py`, `merge_molit.py`, `molit_batches/`)에 있다.

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

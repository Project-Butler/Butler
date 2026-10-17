# 법정동코드 시딩 데이터

`legal-dong-codes.csv`는 **개발 환경 동작 확인용 샘플 1행**만 들어있다(API 명세 v1.0 예시에 나오는 "서울특별시 송파구 잠실동" — Notion 문서에서 그대로 가져온 값이라 신뢰 가능).

## 운영 전 해야 할 일

전체 법정동 데이터(약 5천 개 동 단위 레코드)를 아래 공식 출처에서 받아 이 CSV를 통째로 교체해야 한다.

- 행정표준코드관리시스템: https://www.code.go.kr/stdcode/regCodeL.do (전체 다운로드: https://www.code.go.kr/stdcodesrch/codeAllDownloadL.do)
- 공공데이터포털(국토교통부 법정동코드): https://www.data.go.kr/data/15123287/fileData.do

위 원본 파일은 컬럼 구성(법정동코드/시도명/시군구명/읍면동명/리명/순위/생성일자/말소일자 등)과 인코딩이 이 프로젝트의 정규화된 형식과 다르다. 받은 뒤:

1. **리(里) 단위 레코드는 제외**하고 동(洞/邑/面) 단위까지만 남긴다 — 커뮤니티·단지 조회가 동 단위(`legalDongCode`가 `..00`으로 끝나는 레코드)를 기준으로 하기 때문이다.
2. **말소(폐지)되지 않은 코드만** 남긴다.
3. 아래 헤더 형식으로 변환해서 `legal-dong-codes.csv`를 덮어쓴다:

```csv
legalDongCode,sidoName,sigunguName,dongName,fullName
1171010100,서울특별시,송파구,잠실동,서울특별시 송파구 잠실동
```

4. `npx prisma db seed`로 적용한다(`prisma/seed.js`가 이 CSV를 읽어 `Region` 테이블에 upsert한다).

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

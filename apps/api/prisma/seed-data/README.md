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

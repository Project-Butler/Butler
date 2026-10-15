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

// 국토교통부 실거래가(매매 상세) 고정 응답 — 2026-11-27 노원구(11350) 2026-11 실제 응답에서 "중계그린" 8건(#270).
// 잇기에 쓰는 칸만 원문 값 그대로 옮겼다(층 · 매수 · 매도 · 중개 칸 등은 뺐다). 요청 주소 · 키는 담지 않는다.
// 한 단지(aptSeq 11350-120)인데 국토부는 모든 거래를 대표 지번 502-1 로 적고, 도로명은 호실이 있는 건물 것으로 적는다
// (동일로207길 17 · 동일로207길 18 · 섬밭로 285). 11-05 거래는 해제(cdealType "O").
import { wrapResponse } from './rtmsResponses.js';

const item = ({ road, roadNo, area, day, amount, cancelled = false }) =>
  [
    '<aptDong> </aptDong><aptNm>중계그린1단지</aptNm><aptSeq>11350-120</aptSeq><bonbun>0502</bonbun><bubun>0001</bubun>',
    `<cdealType>${cancelled ? 'O' : ' '}</cdealType><dealAmount>${amount}</dealAmount><dealDay>${day}</dealDay><dealMonth>11</dealMonth><dealYear>2026</dealYear>`,
    `<excluUseAr>${area}</excluUseAr><jibun>502-1</jibun><landCd>1</landCd>`,
    road === '동일로207길'
      ? `<roadNm>동일로207길</roadNm><roadNmBonbun>${roadNo}</roadNmBonbun><roadNmBubun>00000</roadNmBubun><roadNmCd>4130202</roadNmCd><roadNmSggCd>11350</roadNmSggCd><roadNmbCd>0</roadNmbCd>`
      : `<roadNm>섬밭로</roadNm><roadNmBonbun>${roadNo}</roadNmBonbun><roadNmBubun>00000</roadNmBubun><roadNmCd>3110005</roadNmCd><roadNmSggCd>11350</roadNmSggCd><roadNmbCd>0</roadNmbCd>`,
    '<sggCd>11350</sggCd><umdCd>10600</umdCd><umdNm>중계동</umdNm>',
  ].join('');

export const JUNGGYE_GREEN_ITEMS = [
  item({ road: '동일로207길', roadNo: '00018', area: '49.85', day: '13', amount: '75,000' }),
  item({ road: '섬밭로', roadNo: '00285', area: '49.85', day: '14', amount: '70,900' }),
  item({ road: '동일로207길', roadNo: '00017', area: '49.5', day: '12', amount: '63,000' }),
  item({ road: '섬밭로', roadNo: '00285', area: '49.5', day: '10', amount: '68,000' }),
  item({ road: '동일로207길', roadNo: '00018', area: '44.1', day: '7', amount: '67,500' }),
  item({ road: '동일로207길', roadNo: '00018', area: '49.5', day: '6', amount: '74,700' }),
  item({ road: '동일로207길', roadNo: '00017', area: '39.91', day: '5', amount: '60,000', cancelled: true }),
  item({ road: '동일로207길', roadNo: '00017', area: '39.78', day: '3', amount: '59,500' }),
];

export const JUNGGYE_GREEN_XML = wrapResponse(JUNGGYE_GREEN_ITEMS);

// 우리 단지 — 주소 검색(juso)의 세 줄(모두 kaptCode A13986306 "중계그린"). 등록한 줄에 따라 도로명 키 · 지번이 다르다
export const JUNGGYE_GREEN_LINES = {
  road17: { sourceKey: 'ROAD:113504130202-0-17-0', mainLot: 503, subLot: 0 }, // 동일로207길 17 / 중계동 503 / 106~116동(배포에 등록된 줄)
  road18: { sourceKey: 'ROAD:113504130202-0-18-0', mainLot: 502, subLot: 1 }, // 동일로207길 18 / 중계동 502-1 / 101~105동
  road285: { sourceKey: 'ROAD:113503110005-0-285-0', mainLot: 504, subLot: 1 }, // 섬밭로 285 / 중계동 504-1 / 117~125동
};

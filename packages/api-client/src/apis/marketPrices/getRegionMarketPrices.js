import axiosInstance from '../../axios/axiosInstance';

// 법정동 시세 — 그 동의 모든 단지 거래(우리 단지에 못 이은 것 포함). params 는 단지 시세와 같다
export const getRegionMarketPrices = async ({ legalDongCode, ...params }) => {
  const { data } = await axiosInstance.get(`/market-prices/regions/${legalDongCode}`, { params });
  // 단지 시세와 같은 모양, scope: 'REGION' · complexId: null(recentDeals.complexName 으로 단지 구분)
  return data.data;
};

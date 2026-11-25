import { getLandlordSetup, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 초기 세팅 진행 현황(GET /dashboard/landlord/setup).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetLandlordSetup = ({ onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.LANDLORD_SETUP],
    queryFn: getLandlordSetup,
    onUnauthorized,
  });

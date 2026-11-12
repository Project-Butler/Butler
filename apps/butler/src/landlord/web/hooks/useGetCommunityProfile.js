import { useQuery } from '@tanstack/react-query';
import { getCommunityProfile, queryKey } from '@butler/api-client';

// 내 커뮤니티 닉네임. complexId(지금 고른 건물)는 미리보기 표기 때문에 키에 넣는다.
export const useGetCommunityProfile = ({ complexId }) =>
  useQuery({
    queryKey: [queryKey.COMMUNITY_PROFILE, complexId],
    queryFn: () => getCommunityProfile({ complexId }),
    enabled: Boolean(complexId),
  });

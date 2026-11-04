import { useQuery } from '@tanstack/react-query';
import { getCommunityPost, queryKey } from '@butler/api-client';

export const useGetCommunityPost = (postId) =>
  useQuery({
    queryKey: [queryKey.COMMUNITY_POST_DETAIL, postId],
    queryFn: () => getCommunityPost(postId),
    enabled: Boolean(postId),
  });

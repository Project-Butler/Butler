import { useQuery } from '@tanstack/react-query';
import { getCommunityPoll, queryKey } from '@butler/api-client';

export const useGetCommunityPoll = (pollId) =>
  useQuery({
    queryKey: [queryKey.COMMUNITY_POLL_DETAIL, pollId],
    queryFn: () => getCommunityPoll(pollId),
    enabled: Boolean(pollId),
  });

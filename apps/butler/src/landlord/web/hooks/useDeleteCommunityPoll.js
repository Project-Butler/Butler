import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCommunityPoll, queryKey } from '@butler/api-client';

export const useDeleteCommunityPoll = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCommunityPoll,
    onSuccess: (_data, pollId) => {
      queryClient.removeQueries({ queryKey: [queryKey.COMMUNITY_POLL_DETAIL, pollId] });
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POLLS] });
    },
  });
};

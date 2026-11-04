import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postCommunityPoll, queryKey } from '@butler/api-client';

// 새 투표는 응답이 상세와 같은 모양이라 상세 캐시에 바로 넣고, 목록은 다시 불러온다.
export const usePostCommunityPoll = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postCommunityPoll,
    onSuccess: (poll) => {
      queryClient.setQueryData([queryKey.COMMUNITY_POLL_DETAIL, poll.id], poll);
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POLLS] });
    },
  });
};

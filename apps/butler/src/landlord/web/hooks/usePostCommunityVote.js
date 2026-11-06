import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postCommunityVote, queryKey } from '@butler/api-client';

// 참여 응답이 상세와 같은 모양이라 상세 캐시를 바로 바꾸고, 목록(참여 인원·참여함)은 다시 불러온다.
export const usePostCommunityVote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postCommunityVote,
    onSuccess: (poll) => {
      queryClient.setQueryData([queryKey.COMMUNITY_POLL_DETAIL, poll.id], poll);
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POLLS] });
    },
  });
};

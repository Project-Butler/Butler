import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCommunityComment, queryKey } from '@butler/api-client';

// mutate({ commentId, postId }) — postId 는 상세 캐시를 다시 불러오는 데만 쓴다.
export const useDeleteCommunityComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId }) => deleteCommunityComment(commentId),
    onSuccess: (_data, { postId }) => {
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POST_DETAIL, postId] });
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POSTS] });
    },
  });
};

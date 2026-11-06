import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postCommunityComment, queryKey } from '@butler/api-client';

// 댓글 수가 목록에도 보여서 상세와 목록을 같이 다시 불러온다.
export const usePostCommunityComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postCommunityComment,
    onSuccess: (_comment, { postId }) => {
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POST_DETAIL, postId] });
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POSTS] });
    },
  });
};

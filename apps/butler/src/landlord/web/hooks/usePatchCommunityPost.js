import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchCommunityPost, queryKey } from '@butler/api-client';

export const usePatchCommunityPost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: patchCommunityPost,
    onSuccess: (post) => {
      queryClient.setQueryData([queryKey.COMMUNITY_POST_DETAIL, post.id], post);
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POSTS] });
    },
  });
};

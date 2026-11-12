import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCommunityPost, queryKey } from '@butler/api-client';

export const useDeleteCommunityPost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCommunityPost,
    onSuccess: (_data, postId) => {
      queryClient.removeQueries({ queryKey: [queryKey.COMMUNITY_POST_DETAIL, postId] });
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POSTS] });
    },
  });
};

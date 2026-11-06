import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postCommunityPost, queryKey } from '@butler/api-client';

// 새 글은 응답이 상세와 같은 모양이라 상세 캐시에 바로 넣고, 목록은 다시 불러온다.
export const usePostCommunityPost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postCommunityPost,
    onSuccess: (post) => {
      queryClient.setQueryData([queryKey.COMMUNITY_POST_DETAIL, post.id], post);
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POSTS] });
    },
  });
};

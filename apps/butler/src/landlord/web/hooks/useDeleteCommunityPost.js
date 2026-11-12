import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCommunityPost, queryKey } from '@butler/api-client';

// 지운 글의 상세 캐시는 이 훅을 쓰는 화면(글 상세)이 사라질 때 — 화면을 떠난 뒤 — 버린다.
// 떠나기 전에 버리면 "목록으로"(브라우저 뒤로)가 끝나기 전 상세가 한 번 더 그려지며 지운 글을 다시 불러 404 가 난다.
export const useDeleteCommunityPost = () => {
  const queryClient = useQueryClient();
  const deletedIds = useRef([]);

  useEffect(
    () => () => {
      for (const postId of deletedIds.current) queryClient.removeQueries({ queryKey: [queryKey.COMMUNITY_POST_DETAIL, postId] });
    },
    [queryClient],
  );

  return useMutation({
    mutationFn: deleteCommunityPost,
    onSuccess: (_data, postId) => {
      deletedIds.current.push(postId);
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POSTS] });
    },
  });
};

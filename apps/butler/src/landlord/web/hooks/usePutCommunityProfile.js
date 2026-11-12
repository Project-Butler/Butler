import { useMutation, useQueryClient } from '@tanstack/react-query';
import { putCommunityProfile, queryKey } from '@butler/api-client';

// 닉네임은 글 · 댓글 · 투표에 읽을 때 붙는다 — 바꾸면 이미 불러온 목록 · 상세의 작성자 칸도 다시 불러온다.
export const usePutCommunityProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: putCommunityProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_PROFILE] });
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POSTS] });
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POST_DETAIL] });
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POLL_DETAIL] });
    },
  });
};

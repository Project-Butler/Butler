import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCommunityPoll, queryKey } from '@butler/api-client';

// 지운 투표의 상세 캐시는 이 훅을 쓰는 화면(투표 상세)이 사라질 때 — 화면을 떠난 뒤 — 버린다(useDeleteCommunityPost 와 같은 이유).
export const useDeleteCommunityPoll = () => {
  const queryClient = useQueryClient();
  const deletedIds = useRef([]);

  useEffect(
    () => () => {
      for (const pollId of deletedIds.current) queryClient.removeQueries({ queryKey: [queryKey.COMMUNITY_POLL_DETAIL, pollId] });
    },
    [queryClient],
  );

  return useMutation({
    mutationFn: deleteCommunityPoll,
    onSuccess: (_data, pollId) => {
      deletedIds.current.push(pollId);
      queryClient.invalidateQueries({ queryKey: [queryKey.COMMUNITY_POLLS] });
    },
  });
};

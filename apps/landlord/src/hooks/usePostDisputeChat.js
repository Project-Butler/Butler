import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postDisputeChat, queryKey } from '@butler/api-client';

// 새 대화는 응답에 대화 전체가 오므로 상세 캐시에 바로 넣는다.
export const usePostDisputeChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postDisputeChat,
    onSuccess: (chat) => {
      queryClient.setQueryData([queryKey.DISPUTE_CHAT_DETAIL, chat.id], chat);
      queryClient.invalidateQueries({ queryKey: [queryKey.DISPUTE_CHATS] });
    },
  });
};

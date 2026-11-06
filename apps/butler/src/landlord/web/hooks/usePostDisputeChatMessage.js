import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postDisputeChatMessage, queryKey } from '@butler/api-client';

// 응답으로 온 [질문, 답변]을 상세 캐시 끝에 붙인다.
export const usePostDisputeChatMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postDisputeChatMessage,
    onSuccess: (messages, { chatId }) => {
      queryClient.setQueryData([queryKey.DISPUTE_CHAT_DETAIL, chatId], (chat) =>
        chat ? { ...chat, messages: [...chat.messages, ...messages] } : chat,
      );
      queryClient.invalidateQueries({ queryKey: [queryKey.DISPUTE_CHATS] });
    },
  });
};

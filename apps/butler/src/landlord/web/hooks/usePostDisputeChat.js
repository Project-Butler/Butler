import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postDisputeChat, queryKey } from '@butler/api-client';

// 새 대화는 응답에 대화 전체가 오므로 상세 캐시에 바로 넣고, 목록 맨 위에도 바로 넣는다
// (목록을 다시 불러오는 동안 빈칸으로 보이지 않게). 그다음 서버 목록으로 다시 맞춘다.
export const usePostDisputeChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postDisputeChat,
    onSuccess: (chat) => {
      queryClient.setQueryData([queryKey.DISPUTE_CHAT_DETAIL, chat.id], chat);
      queryClient.setQueryData([queryKey.DISPUTE_CHATS], (list) => {
        if (!list) return list;
        const { messages: _messages, ...summary } = chat;
        return { ...list, data: [summary, ...list.data], meta: { ...list.meta, total: list.meta.total + 1 } };
      });
      queryClient.invalidateQueries({ queryKey: [queryKey.DISPUTE_CHATS] });
    },
  });
};

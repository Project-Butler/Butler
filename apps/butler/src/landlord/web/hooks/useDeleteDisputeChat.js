import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteDisputeChat, queryKey } from '@butler/api-client';

export const useDeleteDisputeChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDisputeChat,
    onSuccess: (_data, chatId) => {
      queryClient.removeQueries({ queryKey: [queryKey.DISPUTE_CHAT_DETAIL, chatId] });
      queryClient.invalidateQueries({ queryKey: [queryKey.DISPUTE_CHATS] });
    },
  });
};

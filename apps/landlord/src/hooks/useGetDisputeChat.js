import { useQuery } from '@tanstack/react-query';
import { getDisputeChat, queryKey } from '@butler/api-client';

export const useGetDisputeChat = (chatId) =>
  useQuery({
    queryKey: [queryKey.DISPUTE_CHAT_DETAIL, chatId],
    queryFn: () => getDisputeChat(chatId),
    enabled: Boolean(chatId),
  });

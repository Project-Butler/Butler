import { useQuery } from '@tanstack/react-query';
import { getDisputeChatList, queryKey } from '@butler/api-client';

// 상담 목록은 최근 대화 50개까지만 보여준다.
const CHAT_LIST_SIZE = 50;

export const useGetDisputeChatList = () =>
  useQuery({
    queryKey: [queryKey.DISPUTE_CHATS],
    queryFn: () => getDisputeChatList({ size: CHAT_LIST_SIZE }),
  });

import { useState } from 'react';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useDeleteDisputeChat } from './useDeleteDisputeChat';
import { useGetDisputeChat } from './useGetDisputeChat';
import { useGetDisputeChatList } from './useGetDisputeChatList';
import { usePostDisputeChat } from './usePostDisputeChat';
import { usePostDisputeChatMessage } from './usePostDisputeChatMessage';

// 분쟁 해결사 오른쪽 AI 상담 패널(DisputeChatPanel)의 대화 상태. 동작은 AI 상담 화면(DisputeChatPage, #2 담당)과
// 같게 맞춘 복사본이다 — 담당자와 협의되면 그 화면도 이 hook을 쓰도록 합친다.
// initialDraft: 입력창을 미리 채워서 시작할 때
export const useDisputeConversation = ({ initialDraft = '' } = {}) => {
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [draft, setDraft] = useState(initialDraft);
  // 답변을 기다리는 동안 화면에 먼저 보여줄 질문
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const chatList = useGetDisputeChatList();
  const chat = useGetDisputeChat(selectedChatId);
  const startChat = usePostDisputeChat();
  const sendMessage = usePostDisputeChatMessage();
  const deleteChat = useDeleteDisputeChat();

  const messages = selectedChatId ? (chat.data?.messages ?? []) : [];
  const isPending = pendingQuestion !== null;

  const ask = async (question) => {
    setPendingQuestion(question);
    setDraft('');
    setErrorMessage('');
    try {
      if (selectedChatId) {
        await sendMessage.mutateAsync({ chatId: selectedChatId, message: question });
      } else {
        const created = await startChat.mutateAsync({ message: question });
        setSelectedChatId(created.id);
      }
    } catch (error) {
      // 실패한 질문은 서버에 저장되지 않으므로 입력창에 되돌려서 다시 보낼 수 있게 한다.
      setDraft(question);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setPendingQuestion(null);
    }
  };

  const selectChat = (chatId) => {
    setSelectedChatId(chatId);
    setErrorMessage('');
  };

  const removeChat = async (target) => {
    if (!window.confirm(`"${target.title}" 상담을 삭제할까요? 삭제하면 되돌릴 수 없어요.`)) return;
    try {
      await deleteChat.mutateAsync(target.id);
      if (target.id === selectedChatId) setSelectedChatId(null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  return {
    chats: chatList.data?.data ?? [],
    isChatListLoading: chatList.isLoading,
    isChatLoading: Boolean(selectedChatId) && chat.isLoading,
    selectedChatId,
    messages,
    draft,
    setDraft,
    pendingQuestion,
    isPending,
    errorMessage,
    ask,
    selectChat,
    removeChat,
  };
};

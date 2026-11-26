import { useCallback, useEffect, useRef, useState } from 'react';
import { useAttachmentUploads } from '../upload/useAttachmentUploads';
import { ATTACHMENT_COUNT_NOTICE, ATTACHMENT_MISSING_TEXT, MAX_MESSAGE_ATTACHMENTS, MAX_MESSAGE_LENGTH } from './threadRules';

// 대화 입력 상태(글 + 첨부). conversation 은 useThreadConversation() 반환값.
// 첨부는 공용 업로드 훅으로 올린다(업로드 세션 targetResourceType THREAD_MESSAGE → 미연결 문서 → 보낼 때 attachmentDocumentIds 로 붙임).
// 보내기 조건: 읽기 전용 아님 · 보내는 중 아님 · 올리는 중/실패 칸 없음 · (글 1~2,000자 또는 첨부 1개 이상).
// 성공하면 글과 첨부 줄을 비운다(문서는 이미 메시지에 붙었다). 실패하면 그대로 둔다.
// 보내다 끝난 대화(THREAD_READ_ONLY)가 되면 올려 둔 미연결 문서를 지운다.
// attachEnabled: false 면 첨부를 쓰지 않는 화면(업로드 규칙도 받지 않음). ThreadComposer showAttach 와 맞춘다.
export const useThreadComposer = (conversation, { onUnauthorized, attachEnabled = true } = {}) => {
  const { thread, sendMessage, isSending, sendError } = conversation;
  const [draft, setDraft] = useState('');
  const uploads = useAttachmentUploads([], {
    onUnauthorized,
    resourceType: 'THREAD_MESSAGE',
    maxCount: MAX_MESSAGE_ATTACHMENTS,
    countNotice: ATTACHMENT_COUNT_NOTICE,
    fetchRules: attachEnabled,
  });
  const { clear, remove, items, documentIds, isUploading, hasFailed } = uploads;

  const readOnly = Boolean(thread?.isReadOnly);
  const trimmed = draft.trim();
  const hasContent = trimmed.length > 0 || documentIds.length > 0;
  const canSend = Boolean(thread) && !readOnly && !isSending && !isUploading && !hasFailed && hasContent && trimmed.length <= MAX_MESSAGE_LENGTH;

  const send = useCallback(async () => {
    if (!canSend) return false;
    const input = documentIds.length > 0 ? { body: trimmed, attachmentDocumentIds: documentIds } : trimmed;
    const sent = await sendMessage(input);
    if (sent) {
      setDraft('');
      clear();
    }
    return sent;
  }, [canSend, documentIds, trimmed, sendMessage, clear]);

  // form 의 onSubmit 에 그대로 넘긴다.
  const submit = useCallback(
    (event) => {
      event?.preventDefault?.();
      return send();
    },
    [send],
  );

  // 끝난 대화가 되면 붙이지 못할 미연결 문서를 치운다.
  const latest = useRef({ items, remove });
  latest.current = { items, remove };
  useEffect(() => {
    if (!readOnly) return;
    for (const item of latest.current.items) latest.current.remove(item.key);
  }, [readOnly]);

  const errorText = sendError ? (sendError.code === 'DOCUMENT_NOT_FOUND' ? ATTACHMENT_MISSING_TEXT : sendError.message) : null;

  return {
    draft,
    setDraft,
    uploads,
    readOnly,
    isSending,
    canSend,
    remaining: MAX_MESSAGE_LENGTH - draft.length,
    send,
    submit,
    errorText,
  };
};

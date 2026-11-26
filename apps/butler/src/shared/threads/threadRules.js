// 대화(소통) 규칙과 안내 문구 — 임대인 앱·임대인 PC·임차인 앱이 같이 쓴다. 서버 한도(threads controller)와 같다.
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_MESSAGE_ATTACHMENTS = 5;
// 남은 글자 수는 이만큼 남았을 때부터 보여 준다(평소에는 입력칸만).
export const MESSAGE_COUNTER_THRESHOLD = 100;

export const IMMUTABLE_NOTICE = '보낸 메시지는 수정·삭제할 수 없어요.';
export const READ_ONLY_NOTICE = '끝난 계약·요청의 대화라 지금은 읽기만 할 수 있어요.';
export const EMPTY_THREAD_TEXT = '아직 메시지가 없어요. 먼저 인사를 건네 보세요.';
export const HIDDEN_MESSAGE_TEXT = '운영자가 숨긴 메시지입니다';
export const ATTACHMENT_COUNT_NOTICE = `첨부는 메시지 하나에 ${MAX_MESSAGE_ATTACHMENTS}개까지 보낼 수 있어요.`;
export const ATTACHMENT_MISSING_TEXT = '첨부를 다시 골라 주세요.';
export const ATTACHMENT_UNAVAILABLE_TEXT = '파일 첨부 준비 중이에요. 글은 그대로 보낼 수 있어요.';

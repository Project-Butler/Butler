// 대화(소통) 표시 계산 — 임대인 앱·임대인 PC·임차인 앱이 같이 쓴다. 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
import { HIDDEN_MESSAGE_TEXT } from './threadRules';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// ISO 시각 → 한국 시간 기준 날짜 값(UTC 필드로 읽는다).
const toKst = (isoString) => new Date(new Date(isoString).getTime() + KST_OFFSET_MS);
const pad = (value) => String(value).padStart(2, '0');

// '2026-10-19'
export const toMessageDayKey = (isoString) => {
  const kst = toKst(isoString);
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
};

// '2026-10-19 (월)'
export const formatMessageDay = (isoString) => `${toMessageDayKey(isoString)} (${WEEKDAYS[toKst(isoString).getUTCDay()]})`;

// '14:05'
export const formatMessageTime = (isoString) => {
  const kst = toKst(isoString);
  return `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
};

// 날짜 구분선용 묶음. messages 는 오래된 것 → 최신 순. 반환: [{ key, label, items }]
export const groupMessagesByDay = (messages) => {
  const groups = [];
  for (const message of messages) {
    const key = toMessageDayKey(message.sentAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(message);
    else groups.push({ key, label: formatMessageDay(message.sentAt), items: [message] });
  }
  return groups;
};

// 대화 상대(나 말고 첫 참여자). 없으면 null.
export const getCounterpart = (thread, myUserId) => thread.participants.find((participant) => participant.id !== myUserId) ?? null;

// 상단 제목: '김임차 · 101동 1203호 계약'. 상대나 제목(title 은 null 일 수 있다)이 없으면 있는 것만, 둘 다 없으면 '대화'.
export const getThreadTitle = (thread, myUserId) =>
  [getCounterpart(thread, myUserId)?.name, thread.title].filter(Boolean).join(' · ') || '대화';

export const isMyMessage = (message, myUserId) => message.sender?.id === myUserId;

// ── 대화 목록(2-2) ──

// 대화 상대 이름(나 아닌 참여자). 역할을 따지지 않아 임대인·임차인이 같이 쓴다. 없으면 null.
export const getThreadCounterpartName = (thread, myUserId) => getCounterpart(thread, myUserId)?.name ?? null;

// 서버 순서(최근 메시지 순)를 지키되, 읽기 전용(지난 대화)만 맨 아래로 내린다.
export const sortThreadsForList = (threads) => [...threads.filter((thread) => !thread.isReadOnly), ...threads.filter((thread) => thread.isReadOnly)];

// 안 읽은 메시지가 있는 대화 수
export const countUnreadThreads = (threads) => threads.filter((thread) => thread.unreadCount > 0).length;

// 목록 시각: 오늘이면 '14:05', 올해면 '11월 20일', 그 전이면 '2025.11.20' (한국 시간)
export const formatThreadListTime = (isoString, now = new Date()) => {
  if (!isoString) return '';
  const kst = toKst(isoString);
  if (toMessageDayKey(isoString) === toMessageDayKey(now.toISOString())) return formatMessageTime(isoString);
  if (kst.getUTCFullYear() === toKst(now.toISOString()).getUTCFullYear()) return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
  return `${kst.getUTCFullYear()}.${pad(kst.getUTCMonth() + 1)}.${pad(kst.getUTCDate())}`;
};

const describeAttachments = (attachments) => (attachments.every((attachment) => attachment.mimeType?.startsWith('image/')) ? '사진' : '파일');

// 마지막 메시지 한 줄: 내가 보냈으면 '나: ', 첨부가 있으면 ' · 사진'(사진만) / ' · 파일', 첨부만이면 '사진'/'파일'.
export const getLastMessagePreview = (thread, myUserId) => {
  const message = thread.lastMessage;
  if (!message) return '아직 메시지가 없어요';
  if (message.isHidden) return HIDDEN_MESSAGE_TEXT;
  const text = (message.body ?? '').replace(/\s+/g, ' ').trim();
  const attachments = message.attachments ?? [];
  const parts = [text, attachments.length > 0 ? describeAttachments(attachments) : null].filter(Boolean);
  const preview = parts.join(' · ');
  return isMyMessage(message, myUserId) ? `나: ${preview}` : preview;
};

// 대화 상대 역할 표시('임차인'·'임대인'). 모르는 역할이면 null.
const ROLE_LABEL = { TENANT: '임차인', LANDLORD: '임대인' };
export const getThreadCounterpartRoleLabel = (thread, myUserId) => ROLE_LABEL[getCounterpart(thread, myUserId)?.role] ?? null;

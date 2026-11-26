// 대화(소통) 표시 계산 — 임대인 앱·임대인 PC·임차인 앱이 같이 쓴다. 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
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

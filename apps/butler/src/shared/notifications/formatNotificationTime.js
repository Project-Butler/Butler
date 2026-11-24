// 알림 목록 시각 표시. 임대인 앱·임차인 앱 알림 목록이 같이 쓴다.
// 알림 시각: 1분 안 '방금', 1시간 안 'n분 전', 하루 안 'n시간 전', 그 밖은 'M월 D일'(KST)
export const formatNotificationTime = (createdAt, now = new Date()) => {
  const diffMinutes = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000);
  if (diffMinutes < 1) return '방금';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffMinutes < 60 * 24) return `${Math.floor(diffMinutes / 60)}시간 전`;
  const kst = new Date(new Date(createdAt).getTime() + 9 * 3600000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
};

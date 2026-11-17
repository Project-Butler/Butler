// 커뮤니티 닉네임 규칙 — 길이 · 글자 · 금지 낱말 · 바꾸는 주기를 이 파일 하나에 둔다(계획서 12-3, PC 명세 10절).
// 서비스(service/profiles.js)는 여기 값을 읽기만 한다. 화면 문구("2~12자 · 한글 · 영문 · 숫자 · 30일에 한 번")도 이 값과 같아야 한다.
//
// 한 줄 요약
//   - 2~12자, 한글(완성형) · 영문 · 숫자, 가운데 공백 하나까지. 앞뒤 공백은 떼고 본다
//   - 전체에서 하나 — 영문 대소문자와 띄어쓰기는 무시하고 비교한다
//   - 운영자 · 관리자 · 버틀러 같은 사칭 낱말이 들어가면 안 된다
//   - 처음 정하기는 언제든, 바꾸기는 30일에 한 번(처음 정한 뒤 첫 바꾸기는 바로 된다)

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 12;

// 한글 완성형 · 영문 · 숫자 낱말 하나, 또는 그런 낱말 둘을 공백 하나로 이은 것.
//   왜 완성형만: "ㅋㅋ" · "ㅏㅏ" 같은 낱자 닉네임은 글 목록에서 사람을 가리키기 어렵다
//   왜 공백 하나: "삼전동 부자" 처럼 띄어 쓰는 이름은 허용하되, 공백을 여러 개 넣어 같은 이름처럼 보이게 하는 것은 막는다
export const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9]+(?: [가-힣A-Za-z0-9]+)?$/;

// 들어가면 안 되는 낱말(비교 키 기준 — 소문자 · 띄어쓰기 없앤 것에 포함되면 탈락).
//   왜: 운영 주체를 사칭해 공지처럼 보이는 글을 막는다. 목록은 이사님 피드백의 예(운영자 · 관리자 · 버틀러 · butler · admin)에 비슷한 말을 더했다
export const NICKNAME_BANNED_WORDS = [
  '운영자', '운영진', '운영팀', '관리자', '관리팀', '버틀러', '고객센터', '공식',
  'butler', 'admin', 'official', 'staff',
];

// 바꾸기 주기(일). 처음 정하기는 세지 않는다 — 마지막으로 "바꾼" 때부터 센다.
//   왜: 닉네임을 자주 바꾸면 글 목록에서 같은 사람을 알아보기 어렵다. 처음 정한 직후 오타를 고칠 수 있게 첫 바꾸기는 막지 않는다
export const NICKNAME_CHANGE_INTERVAL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// 입력값 다듬기: 유니코드 정규화(NFC) 후 앞뒤 공백 제거. 저장 · 표시는 이 값.
export const cleanNickname = (value) => value.normalize('NFC').trim();

// 비교 키: 영문 소문자, 띄어쓰기 없음. 전체에서 유일(DB 유일 제약).
//   왜 띄어쓰기도 무시: "삼전동 부자" 와 "삼전동부자" 는 글 목록에서 같은 사람처럼 보인다
export const toNicknameKey = (nickname) => cleanNickname(nickname).toLowerCase().replace(/\s+/g, '');

// 규칙 검사 → 문제가 없으면 null, 있으면 'LENGTH' | 'FORMAT' | 'BANNED'. nickname 은 cleanNickname 을 거친 값.
export const checkNickname = (nickname) => {
  if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) return 'LENGTH';
  if (!NICKNAME_PATTERN.test(nickname)) return 'FORMAT';
  const key = toNicknameKey(nickname);
  if (NICKNAME_BANNED_WORDS.some((word) => key.includes(word))) return 'BANNED';
  return null;
};

// 다음에 바꿀 수 있는 때. 바꾼 적이 없으면(처음 정한 것만 있으면) null — 지금 바꿀 수 있다.
export const nextNicknameChangeAt = (nicknameChangedAt) =>
  nicknameChangedAt ? new Date(nicknameChangedAt.getTime() + NICKNAME_CHANGE_INTERVAL_DAYS * DAY_MS) : null;

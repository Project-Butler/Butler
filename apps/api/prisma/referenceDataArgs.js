// 참고 데이터 스크립트 공용 인자 읽기. 실행 방법이 틀린 경우의 에러는 문구를 그대로 보여 준다(reason).
export const toUsageError = (message) => Object.assign(new Error(message), { reason: message });

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// '--name 값' → 값(없으면 null). 날짜 옵션은 형식을 검사한다.
export const readOption = (argv, name) => {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw toUsageError(`${name} 값이 필요합니다.`);
  if (name.endsWith('-date') && !DATE_PATTERN.test(value)) throw toUsageError(`${name}은 YYYY-MM-DD 형식이어야 합니다.`);
  return value;
};

// 옵션 값이 아닌 첫 인자(파일 경로)
export const readPathArg = (argv, optionNames) => {
  const values = new Set(optionNames.map((name) => readOption(argv, name)).filter(Boolean));
  return argv.find((arg) => !arg.startsWith('--') && !values.has(arg)) ?? null;
};

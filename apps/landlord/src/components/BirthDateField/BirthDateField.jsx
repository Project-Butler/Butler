import { TextField } from '@butler/ui';

// 임시 입력 칸. 회원 정보에서 생년월일을 읽게 되면 이 컴포넌트와 인증 화면의 사용 부분만 빼면 된다(계획 3장).
// 값은 부모 상태에만 두고 저장하지 않는다. 브라우저 자동완성에도 남지 않게 끈다.
export const BirthDateField = ({ value, onChange, error, max, disabled }) => (
  <TextField
    label="생년월일"
    required
    type="date"
    name="verification-birth-date"
    autoComplete="off"
    className="font-num tabular-nums"
    min="1900-01-01"
    max={max}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    error={error}
    hint="건축물대장의 소유자 정보와 비교하는 데만 써요."
    disabled={disabled}
  />
);

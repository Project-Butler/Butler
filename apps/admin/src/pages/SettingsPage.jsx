import { useState } from 'react';
import { Button, Card, TextField } from '@butler/ui';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import { useGetAdminOwnershipVerificationSetting } from '../hooks/useGetAdminOwnershipVerificationSetting';
import { usePatchAdminOwnershipVerificationSetting } from '../hooks/usePatchAdminOwnershipVerificationSetting';
import { formatDateTime } from '../utils/formatDate';

// 서버 검증(apps/api MAX_VALIDITY_YEARS)과 같은 범위
const MAX_VALIDITY_YEARS = 100;

const validateYears = (value) => {
  if (!value) return '유효기간을 입력해 주세요.';
  const years = Number(value);
  return Number.isInteger(years) && years >= 1 && years <= MAX_VALIDITY_YEARS ? undefined : `1~${MAX_VALIDITY_YEARS} 사이의 정수로 입력해 주세요.`;
};

const ValidityForm = ({ setting, onSaved, onUnauthorized }) => {
  const save = usePatchAdminOwnershipVerificationSetting({ onUnauthorized });
  const [years, setYears] = useState(String(setting.validityYears));
  const [isSaved, setIsSaved] = useState(false);

  const yearsError = validateYears(years);
  const isChanged = Number(years) !== setting.validityYears;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (yearsError || !isChanged) return;
    setIsSaved(false);
    const { data } = await save.mutate({ validityYears: Number(years) });
    if (data) {
      setIsSaved(true);
      onSaved(data);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField
        label="유효기간"
        required
        numeric
        inputMode="numeric"
        suffix="년"
        className="max-w-xs"
        value={years}
        onChange={(event) => {
          setIsSaved(false);
          setYears(event.target.value.replace(/\D/g, '').slice(0, 3));
        }}
        error={yearsError}
        hint="새 인증부터 적용돼요. 이미 인증한 호실의 만료일은 바뀌지 않아요."
        disabled={save.isLoading}
      />
      <p className="font-num text-chip tabular-nums text-ink-3">
        마지막 변경: {setting.updatedAt ? formatDateTime(setting.updatedAt) : '변경한 적 없음(기본값)'}
      </p>
      {save.error && (
        <p role="alert" className="text-chip text-crit-ink">
          {save.error.message}
        </p>
      )}
      {isSaved && (
        <p role="status" className="text-chip text-ok-ink">
          저장했습니다.
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={Boolean(yearsError) || !isChanged || save.isLoading}>
          {save.isLoading ? '저장 중' : '저장'}
        </Button>
      </div>
    </form>
  );
};

// 설정. 지금은 권리자 인증 유효기간만 있다. 바꾸면 감사 로그에 남는다.
export const SettingsPage = ({ onUnauthorized }) => {
  const { data, error, isLoading, refetch } = useGetAdminOwnershipVerificationSetting({ onUnauthorized });
  const [saved, setSaved] = useState(null);
  const setting = saved ?? data;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h1 font-bold text-ink">설정</h2>
        <p className="mt-1 text-body text-ink-2">운영에 쓰는 값을 바꿉니다. 변경 내용은 감사 로그에 남습니다.</p>
      </div>

      <Card className="space-y-4 p-5">
        <h3 className="text-section font-semibold text-ink">권리자 인증 유효기간</h3>
        {error && (
          <StatusMessage tone="error" onRetry={refetch}>
            {error.message}
          </StatusMessage>
        )}
        {isLoading && !setting && <StatusMessage>불러오는 중입니다</StatusMessage>}
        {setting && <ValidityForm setting={setting} onSaved={setSaved} onUnauthorized={onUnauthorized} />}
      </Card>
    </div>
  );
};

import { useState } from 'react';
import { Button, Card } from '@butler/ui';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inputClass =
  'h-11 w-full rounded-input border bg-surface px-3 font-num text-body text-ink outline-none placeholder:text-ink-3 focus:border-accent';

// 계약 메뉴. 운영자는 계약을 건별로만 보므로 전체 목록 대신 계약 ID로 찾아 들어간다.
// 감사 로그에서도 계약 상세로 들어갈 수 있다.
export const ContractLookupPage = ({ onNavigate }) => {
  const [contractId, setContractId] = useState('');
  const [inputError, setInputError] = useState(null);

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = contractId.trim();
    if (!UUID_PATTERN.test(trimmed)) {
      setInputError('계약 ID(UUID) 형식이 아닙니다.');
      return;
    }
    onNavigate('contractDetail', { contractId: trimmed });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h1 font-bold text-ink">계약</h2>
        <p className="mt-1 text-body text-ink-2">계약은 건별로만 조회합니다. 계약 ID를 입력하거나 감사 로그에서 계약을 골라 들어가세요.</p>
      </div>

      <Card className="max-w-xl p-5">
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-chip font-medium text-ink-3">계약 ID</span>
            <input
              value={contractId}
              onChange={(event) => {
                setContractId(event.target.value);
                setInputError(null);
              }}
              placeholder="00000000-0000-0000-0000-000000000000"
              aria-invalid={Boolean(inputError)}
              className={`${inputClass} ${inputError ? 'border-crit-ink' : 'border-line'}`}
            />
            {inputError && (
              <span role="alert" className="text-chip text-crit-ink">
                {inputError}
              </span>
            )}
          </label>
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              조회
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

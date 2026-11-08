import { useState } from 'react';
import { Button, TextField } from '@butler/ui';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { usePostContractTermination } from '../../hooks/usePostContractTermination';
import { CONTRACT_DATE_MIN, CONTRACT_DATE_RANGE_MESSAGE, getMaxTerminationDate, isContractDateInRange } from '../../utils/contract';

// 서버 검증(apps/api contracts controller)과 같은 범위
const MAX_REASON_LENGTH = 200;

// 계약 해지(S-05): 해지일·사유 + 안내 → [취소]·[해지]. 해지일은 오늘과 종료일 중 이른 날까지(D-15).
// 시작 전 계약은 시작일 전으로 해지하면 취소와 같다. 호실 상세의 계약 영역 안에서 [해지]를 누르면 펼쳐진다.
export const ContractTermination = ({ contract, onTerminated, onCancel, onUnauthorized }) => {
  const terminate = usePostContractTermination({ onUnauthorized });
  const maxDate = getMaxTerminationDate(contract.endDate);
  const [terminatedOn, setTerminatedOn] = useState(maxDate);
  const [reason, setReason] = useState('');

  const dateError = !terminatedOn
    ? '해지일을 입력해 주세요.'
    : !isContractDateInRange(terminatedOn)
      ? CONTRACT_DATE_RANGE_MESSAGE
      : terminatedOn > maxDate
        ? '해지일은 오늘과 종료일 중 이른 날까지 고를 수 있어요.'
        : undefined;

  const handleTerminate = async () => {
    if (dateError) return;
    const { data } = await terminate.terminateContract(contract.id, { terminatedOn, reason: reason.trim() || null });
    if (data) onTerminated();
  };

  return (
    <div className="space-y-3 border-t border-line bg-surface-2 px-5 py-4">
      <p className="text-body font-semibold text-ink">계약 해지</p>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="해지일"
          required
          type="date"
          className="font-num tabular-nums"
          min={CONTRACT_DATE_MIN}
          max={maxDate}
          value={terminatedOn}
          onChange={(event) => setTerminatedOn(event.target.value)}
          error={dateError}
          disabled={terminate.isLoading}
        />
        <TextField
          label="사유 (선택)"
          placeholder="예: 임차인 요청으로 조기 해지"
          maxLength={MAX_REASON_LENGTH}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={terminate.isLoading}
        />
      </div>
      <p className="text-sub text-ink-2">이 계약을 해지할까요? 해지한 계약은 되돌리거나 수정할 수 없어요. 잘못 등록한 계약도 해지로 정리해요.</p>
      {terminate.error && <NoticeBox>{terminate.error.message}</NoticeBox>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="h44" onClick={onCancel} disabled={terminate.isLoading}>
          취소
        </Button>
        <Button size="h44" onClick={handleTerminate} disabled={Boolean(dateError) || terminate.isLoading}>
          {terminate.isLoading ? '해지 중' : '해지'}
        </Button>
      </div>
    </div>
  );
};

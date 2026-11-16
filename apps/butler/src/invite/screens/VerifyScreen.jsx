import { useEffect, useRef, useState } from 'react';
import { Button } from '@butler/ui';
import { Info } from 'lucide-react';
import { formatPhoneMask, formatWait, sanitizeLast4 } from '../inviteState';
import { InviteFrame } from '../InviteFrame';

const BOXES = [0, 1, 2, 3];

// B2 본인 확인: 계약에 적힌 휴대폰 번호 뒤 4자리. 입력은 숫자 칸 하나(4칸은 보여 주기만), 틀려도 링크는 잠그지 않는다.
// error: { message, waitSeconds? } — waitSeconds 가 있으면 그동안 [확인]을 막고 남은 시간을 센다. 횟수는 보여 주지 않는다.
export const VerifyScreen = ({ onBack, onSubmit, busy, error }) => {
  const [digits, setDigits] = useState('');
  const [remaining, setRemaining] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 실패하면 다시 입력하기 쉽게 비운다. 대기 시간이 있으면 1초씩 센다.
  useEffect(() => {
    if (!error) return undefined;
    setDigits('');
    inputRef.current?.focus();
    setRemaining(error.waitSeconds ?? 0);
    if (!error.waitSeconds) return undefined;
    const timer = setInterval(() => setRemaining((value) => (value <= 1 ? 0 : value - 1)), 1000);
    return () => clearInterval(timer);
  }, [error]);

  const isWaiting = remaining > 0;
  const canSubmit = digits.length === 4 && !busy && !isWaiting;
  const submit = (event) => {
    event.preventDefault();
    if (canSubmit) onSubmit(digits);
  };

  return (
    <form onSubmit={submit} noValidate>
      <InviteFrame
        top={{ title: '본인 확인', onBack }}
        cta={
          <Button type="submit" size="h52" className="w-full" disabled={!canSubmit}>
            {busy ? '확인하는 중이에요' : '확인'}
          </Button>
        }
      >
        <div>
          <h1 className="text-m-h1 font-bold text-ink">
            임차인 본인인지
            <br />
            확인할게요
          </h1>
          <p className="mt-1 text-body text-ink-2">계약서에 적힌 휴대폰 번호 뒤 4자리를 입력해 주세요.</p>
        </div>
        <div className="relative">
          <span aria-hidden="true" className="flex gap-2">
            {BOXES.map((position) => {
              const digit = digits[position];
              const isCurrent = position === digits.length;
              const border = error && !digits ? 'border-2 border-crit' : digit || isCurrent ? 'border-2 border-accent' : 'border border-line';
              return (
                <span
                  key={position}
                  className={`flex h-14 flex-1 items-center justify-center rounded-input bg-surface font-num text-[22px] font-bold tabular-nums ${border} ${digit ? 'text-ink' : 'text-dash'}`}
                >
                  {digit ?? '·'}
                </span>
              );
            })}
          </span>
          <input
            ref={inputRef}
            value={digits}
            onChange={(event) => setDigits(sanitizeLast4(event.target.value))}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={4}
            aria-label="휴대폰 번호 뒤 4자리"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby="invite-verify-help"
            className="absolute inset-0 h-full w-full cursor-text opacity-0"
          />
        </div>
        <p className="font-num text-m-sub tabular-nums text-ink-3">{formatPhoneMask(digits)}</p>
        {error && (
          <p role="alert" className="text-m-sub font-semibold text-crit-ink">
            {error.message}
            {isWaiting && <span className="font-num tabular-nums"> ({formatWait(remaining)} 뒤)</span>}
          </p>
        )}
        <p id="invite-verify-help" className="flex items-start gap-1.5 text-m-sub text-ink-3">
          <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
          번호가 바뀌었다면 임대인에게 계약 정보 수정을 요청하세요.
        </p>
      </InviteFrame>
    </form>
  );
};

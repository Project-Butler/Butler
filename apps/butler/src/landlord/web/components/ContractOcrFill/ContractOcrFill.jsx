// Created: 2026-11-19
// 계약 등록 화면의 [계약서로 채우기](B팀, #168). 계약서 사진 · PDF를 읽어 찾은 값으로 칸을 채운다. 저장은 하지 않는다.
// 폼 위 띠 자리(FormPageLayout notice)에 들어간다. 채운 칸과 확인이 필요한 내용을 띠 안에 보여 준다.
import { useRef, useState } from 'react';
import { CircleCheck, ScanText } from 'lucide-react';
import { Button } from '@butler/ui';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { usePostContractOcr } from '../../hooks/usePostContractOcr';
import { CONTRACT_OCR_ACCEPT, prepareContractOcrFile } from '../../utils/contractOcrFile';

const FIELD_LABELS = {
  leaseType: '계약 유형',
  deposit: '보증금',
  monthlyRent: '월세',
  rentPaymentDay: '월세 입금일',
  startDate: '시작일',
  endDate: '종료일',
  tenantName: '임차인 이름',
  tenantPhone: '임차인 연락처',
  memo: '메모(특약)',
};

// 외부 처리 안내 · 동의(권리자 인증 VerifyModal의 동의 안내와 같은 모양)
const CONSENT_ROWS = [
  ['처리 항목', '올린 계약서 파일과 거기서 읽은 글자. 주민등록번호는 지운 뒤 처리해요.'],
  ['처리 목적', '계약 등록 입력칸 채우기'],
  ['외부 처리', '네이버클라우드(계약서 글자 읽기), Anthropic(읽은 글자에서 계약 값 정리)'],
  ['보관', '계약서 파일과 읽은 내용은 처리가 끝나면 바로 파기하고 저장하지 않아요.'],
  ['거부 권리', '동의하지 않아도 계약 내용을 직접 입력해 등록할 수 있어요.'],
];

const ConsentNotice = () => (
  <dl className="space-y-1.5 text-sub text-ink-2">
    {CONSENT_ROWS.map(([term, description]) => (
      <div key={term} className="flex gap-2">
        <dt className="w-16 shrink-0 font-semibold text-ink">{term}</dt>
        <dd>{description}</dd>
      </div>
    ))}
  </dl>
);

// 채운 결과(눈에 띄게): 제목 + 확인 안내
const FilledResult = ({ memoTruncated }) => (
  <div role="status" className="space-y-1.5 rounded-input bg-accent-soft px-4 py-3.5">
    <p className="flex items-center gap-2 text-card font-semibold text-accent-strong">
      <CircleCheck size={18} className="shrink-0" aria-hidden="true" />
      계약서로 채웠어요
    </p>
    <p className="text-body text-accent-strong">계약서와 같은지 칸마다 확인한 뒤 [계약 등록]을 눌러 주세요.</p>
    {memoTruncated && <p className="text-body text-warn-ink">특약이 1,000자를 넘어 뒷부분이 잘렸어요. 메모 칸을 확인해 주세요.</p>}
  </div>
);

// 계약서에서 찾은 값은 이미 입력한 칸도 덮어쓴다. 찾지 못한 칸(null)은 입력한 값을 그대로 둔다.
// → { form, filledFields }
export const applyContractOcrFields = (form, fields) => {
  const next = { ...form };
  const filledFields = [];
  const fill = (name, value) => {
    if (value === null || value === undefined) return;
    next[name] = String(value);
    filledFields.push(name);
  };

  fill('leaseType', fields.leaseType);
  fill('deposit', fields.deposit);
  // 전세는 월세 · 입금일 칸이 없다(ContractForm). 유형을 전세로 바꿀 때처럼 두 칸을 비운다.
  if (next.leaseType === 'JEONSE') {
    next.monthlyRent = '';
    next.rentPaymentDay = '';
  } else {
    fill('monthlyRent', fields.monthlyRent);
    fill('rentPaymentDay', fields.rentPaymentDay);
  }
  fill('startDate', fields.startDate);
  fill('endDate', fields.endDate);
  fill('tenantName', fields.tenantName);
  fill('tenantPhone', fields.tenantPhone);
  fill('memo', fields.memo);
  return { form: next, filledFields };
};

// ownershipId: 고른 호실의 소유 관계(없으면 버튼을 막는다). form · onFill(nextForm): 계약 등록 폼 상태
export const ContractOcrFill = ({ ownershipId, form, onFill, disabled = false, onUnauthorized }) => {
  const inputRef = useRef(null);
  // 읽는 동안(수십 초) 사용자가 칸을 고칠 수 있어서, 응답이 온 시점의 최신 폼에 채운다.
  const formRef = useRef(form);
  formRef.current = form;
  const ocr = usePostContractOcr({ onUnauthorized });
  const [isConfirming, setIsConfirming] = useState(false);
  const [filledFields, setFilledFields] = useState(null);

  const isBusy = ocr.isLoading;
  const canStart = Boolean(ownershipId) && !disabled && !isBusy;

  const handleFile = async (event) => {
    const picked = event.target.files?.[0];
    // 같은 파일을 다시 골라도 change가 오게 비운다.
    event.target.value = '';
    if (!picked) return;
    setIsConfirming(false);
    setFilledFields(null);

    const prepared = await prepareContractOcrFile(picked);
    if (prepared.error) {
      ocr.setLocalError(prepared.error);
      return;
    }
    const { data } = await ocr.readContract({ ownershipId, file: prepared.file });
    if (!data) return;
    const result = applyContractOcrFields(formRef.current, data.fields);
    onFill(result.form);
    setFilledFields(result.filledFields);
  };

  const warnings = ocr.data?.warnings ?? [];

  return (
    <div className="space-y-3 rounded-t-card border-b border-line px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <ScanText size={18} className="shrink-0 text-ink-2" aria-hidden="true" />
        <div className="mr-auto">
          <p className="text-label font-semibold text-ink">계약서로 채우기</p>
          <p className="text-sub text-ink-2">
            {ownershipId
              ? '계약서 사진이나 PDF를 올리면 찾은 값으로 칸을 채워 드려요. 이미 입력한 값도 바뀌니 저장 전에 꼭 확인해 주세요.'
              : '호실을 먼저 골라 주세요.'}
          </p>
        </div>
        {!isConfirming && (
          <Button type="button" variant="secondary" size="h44" onClick={() => setIsConfirming(true)} disabled={!canStart}>
            {isBusy ? '계약서 읽는 중' : '계약서로 채우기'}
          </Button>
        )}
      </div>

      {isConfirming && (
        <div className="space-y-3 rounded-input bg-surface-2 p-4">
          <p className="text-label font-semibold text-ink">계약서를 외부 서비스에서 읽어요</p>
          <ConsentNotice />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsConfirming(false)}>
              취소
            </Button>
            <Button type="button" size="sm" onClick={() => inputRef.current?.click()} disabled={!canStart}>
              동의하고 계약서 선택
            </Button>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept={CONTRACT_OCR_ACCEPT} onChange={handleFile} className="hidden" />

      {isBusy && (
        <p role="status" className="text-sub text-ink-3">
          계약서를 읽고 있어요. 30초 정도 걸릴 수 있어요.
        </p>
      )}
      {ocr.error && <NoticeBox>{ocr.error.message || '잠시 후 다시 시도해 주세요.'}</NoticeBox>}

      {ocr.data && filledFields?.length > 0 && (
        <FilledResult memoTruncated={ocr.data.memoTruncated && filledFields.includes('memo')} />
      )}
      {ocr.data && filledFields?.length === 0 && <NoticeBox tone="warn">계약서에서 채울 값을 찾지 못했어요. 직접 입력해 주세요.</NoticeBox>}
      {ocr.data && warnings.length > 0 && (
        <NoticeBox tone="warn">
          <p className="font-semibold">확인이 필요해요</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((warning) => (
              <li key={`${warning.field ?? 'check'}-${warning.code}`}>
                {warning.field ? `${FIELD_LABELS[warning.field] ?? warning.field}: ` : ''}
                {warning.message}
              </li>
            ))}
          </ul>
        </NoticeBox>
      )}
    </div>
  );
};

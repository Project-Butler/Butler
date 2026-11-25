import { useState } from 'react';
import { Check, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { Button, MobileFormLayout, TextField } from '@butler/ui';
import { useGetContract } from '../../../shared/useGetContract';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useGetContractList } from '../../web/hooks/useGetContractList';
import { usePatchContract } from '../../web/hooks/usePatchContract';
import { usePostTenantInvitation } from '../../web/hooks/usePostTenantInvitation';
import { formatPhone, isValidPhone, toPhoneDigits } from '../../web/utils/contract';
import { formatDotDate } from '../../web/utils/tenantInvite';
import { BottomSheet, useBottomSheet } from '../components/BottomSheet/BottomSheet';
import { useGoBack } from '../utils/navigation';
import {
  formatInviteContractLabel,
  INVITABLE_CONTRACT_STATUSES,
  isInvitableContract,
  sendInviteLink,
  toInviteContractOptions,
} from '../utils/tenantInviteView';

const CARD_CLASS = 'rounded-card border border-line bg-surface';
const TITLE = '임차인 초대';
const CONTRACT_OPTION_SIZE = 20;
const PHONE_ERROR = '010으로 시작하는 휴대폰 번호를 입력해 주세요';

const VISIBLE_ITEMS = ['계약 기간·보증금·월세', '수리 요청과 진행 상황', '나와의 소통 이력'];
const HIDDEN_ITEMS = '다른 부동산 · 하우스 로그 전체 · 문서함';

// 서버 오류 코드 → 화면 문구. 없는 코드는 서버 문구를 그대로 쓴다.
const INVITE_ERROR_MESSAGE = {
  INVITATION_ALREADY_ACCEPTED: '이미 임차인이 앱에 연결된 계약이에요',
  CONTRACT_READ_ONLY: '끝난 계약이나 소유가 끝난 호실의 계약은 초대할 수 없어요',
};
const toInviteErrorMessage = (error) => (error ? (INVITE_ERROR_MESSAGE[error.code] ?? error.message) : null);
const isPhoneValidationError = (error) =>
  error?.code === 'VALIDATION_ERROR' && (error.details ?? []).some((detail) => detail.field === 'tenantPhone');

const SEND_RESULT_MESSAGE = {
  shared: '링크를 보냈어요. 임차인이 링크에서 본인 확인을 하면 앱에 연결돼요.',
  canceled: '보내기를 닫았어요. 아래 [링크 보내기]로 다시 보낼 수 있어요.',
  copied: '링크를 복사했어요. 문자나 카카오톡에 붙여 넣어 보내 주세요.',
  failed: '자동으로 보내거나 복사하지 못했어요. 아래 링크를 길게 눌러 직접 복사해 주세요.',
};

const Loading = () => (
  <p role="status" className="py-10 text-center text-body text-ink-3">
    불러오는 중입니다
  </p>
);

const VisibilityCard = () => (
  <section aria-label="임차인이 볼 수 있는 것" className={`${CARD_CLASS} flex flex-col gap-2.5 p-4`}>
    <h2 className="text-m-label font-semibold text-ink">임차인이 볼 수 있는 것</h2>
    <ul className="flex flex-col gap-2">
      {VISIBLE_ITEMS.map((item) => (
        <li key={item} className="flex items-center gap-2 text-body text-ink">
          <Check size={16} className="shrink-0 text-accent" aria-hidden="true" />
          {item}
        </li>
      ))}
      <li className="flex items-center gap-2 text-body text-ink-3">
        <X size={16} className="shrink-0" aria-hidden="true" />
        <span>
          <span className="sr-only">볼 수 없음: </span>
          {HIDDEN_ITEMS}
        </span>
      </li>
    </ul>
  </section>
);

// 계약을 고르면 시트가 내려간 뒤 onSelect 를 부른다(부모가 시트를 닫는다).
const ContractSheet = ({ options, selectedId, onSelect, onClose }) => {
  const sheet = useBottomSheet();
  return (
    <BottomSheet label="연결할 계약" onClose={onClose} sheet={sheet}>
      <ul className="flex flex-col gap-2">
        {options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <li key={option.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => sheet.close(() => onSelect(option.id))}
                className={`flex w-full items-center justify-between gap-3 rounded-input border px-4 py-3 text-left ${
                  isSelected ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
                }`}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body text-ink">{formatInviteContractLabel(option)}</span>
                  <span className="text-m-sub text-ink-3">{option.tenantName}</span>
                </span>
                {isSelected && <Check size={18} className="shrink-0 text-accent" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
};

// 링크를 만든 뒤. inviteUrl 은 발급 응답에서 한 번만 받으므로 이 화면을 나가면 다시 볼 수 없다.
const InviteDoneView = ({ invitation, tenantName, sendResult, isSending, onSend, onDone }) => (
  <MobileFormLayout
    shell="landlord-app-form"
    topBar={{ title: TITLE, onBack: onDone }}
    cta={
      <>
        <Button type="button" variant="secondary" size="h52" onClick={onDone}>
          완료
        </Button>
        <Button type="button" size="h52" className="flex-1" disabled={isSending} onClick={onSend}>
          링크 보내기
        </Button>
      </>
    }
  >
    <div className="flex flex-col gap-1.5 pt-2">
      <CheckCircle2 size={28} className="text-accent" aria-hidden="true" />
      <h1 className="text-m-h1 font-bold text-ink">초대 링크를 만들었어요</h1>
      <p className="text-body text-ink-2">{tenantName}님에게 링크를 보내 주세요</p>
    </div>
    <div aria-live="polite">{sendResult && <NoticeBox tone={sendResult === 'failed' ? 'warn' : 'info'}>{SEND_RESULT_MESSAGE[sendResult]}</NoticeBox>}</div>
    <input
      readOnly
      value={invitation.inviteUrl}
      aria-label="초대 링크"
      onFocus={(event) => event.target.select()}
      className="h-12 w-full truncate rounded-input border border-line bg-surface-2 px-3.5 font-num text-body text-ink-2 outline-none"
    />
    <ul className="flex list-disc flex-col gap-1 rounded-input bg-surface-2 py-3 pl-8 pr-4 text-m-sub text-ink-2">
      <li>
        링크는 7일 동안 쓸 수 있어요
        {invitation.expiresAt && <span className="font-num tabular-nums"> ({formatDotDate(invitation.expiresAt)}까지)</span>}
      </li>
      <li>이 화면을 나가면 링크를 다시 볼 수 없어요. 잃어버리면 새로 만들면 돼요(이전 링크는 못 쓰게 돼요)</li>
      <li>임차인은 휴대폰 번호 뒤 4자리로 본인 확인을 해요</li>
    </ul>
  </MobileFormLayout>
);

// 초대 입력(M15). current: 주소로 들어온 계약. 같은 호실(소유 관계)의 초대할 수 있는 계약 중에서 고를 수 있다.
const InviteForm = ({ current, goBack, onUnauthorized }) => {
  const listed = useGetContractList(
    { ownershipId: current.ownershipId, status: INVITABLE_CONTRACT_STATUSES, sort: 'startDate:asc', size: CONTRACT_OPTION_SIZE },
    { onUnauthorized },
  );
  const patch = usePatchContract({ onUnauthorized });
  const invite = usePostTenantInvitation({ onUnauthorized });

  // 번호를 고쳐 저장한 계약은 저장 응답으로 바꿔 둔다(초대가 실패해 다시 눌러도 같은 번호를 또 저장하지 않게).
  const [savedById, setSavedById] = useState({});
  const options = toInviteContractOptions(current, listed.data?.items).map((option) => savedById[option.id] ?? option);
  const [selectedId, setSelectedId] = useState(current.id);
  const selected = options.find((option) => option.id === selectedId) ?? options[0] ?? null;
  const [phone, setPhone] = useState(formatPhone(selected?.tenant?.phone));
  const [phoneError, setPhoneError] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [done, setDone] = useState(null); // { invitation, tenantName }
  const [sendResult, setSendResult] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const isSubmitting = patch.isLoading || invite.isLoading;
  const canChooseContract = options.length > 1;

  const handleSelect = (contractId) => {
    const next = options.find((option) => option.id === contractId);
    setSelectedId(contractId);
    setPhone(formatPhone(next?.tenant?.phone));
    setPhoneError(null);
    patch.reset();
    invite.reset();
    setIsSheetOpen(false);
  };

  const send = async (invitation, tenantName) => {
    setIsSending(true);
    setSendResult(await sendInviteLink({ url: invitation.inviteUrl, tenantName }));
    setIsSending(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selected || isSubmitting) return;
    const digits = toPhoneDigits(phone);
    if (!isValidPhone(digits)) {
      setPhoneError(PHONE_ERROR);
      return;
    }
    setPhoneError(null);
    invite.reset();

    // 본인 확인은 계약의 번호 뒤 4자리로 하므로, 번호가 바뀌었으면 계약을 먼저 고친다. 실패하면 초대하지 않는다.
    if (digits !== toPhoneDigits(selected.tenant?.phone)) {
      const saved = await patch.updateContract(selected.id, { tenantPhone: digits });
      if (!saved.data) {
        if (isPhoneValidationError(saved.error)) setPhoneError(PHONE_ERROR);
        return;
      }
      setSavedById((prev) => ({ ...prev, [saved.data.id]: saved.data }));
    }

    const issued = await invite.createInvitation(selected.id, { sharedDocumentIds: [] });
    if (!issued.data) return;
    setDone({ invitation: issued.data, tenantName: selected.tenantName });
    await send(issued.data, selected.tenantName);
  };

  if (done) {
    return (
      <InviteDoneView
        invitation={done.invitation}
        tenantName={done.tenantName}
        sendResult={sendResult}
        isSending={isSending}
        onSend={() => send(done.invitation, done.tenantName)}
        onDone={goBack}
      />
    );
  }

  const patchErrorMessage = patch.error && !isPhoneValidationError(patch.error) ? toInviteErrorMessage(patch.error) : null;
  const submitErrorMessage = patchErrorMessage ?? toInviteErrorMessage(invite.error);

  return (
    <MobileFormLayout
      shell="landlord-app-form"
      topBar={{ title: TITLE, onBack: goBack }}
      onSubmit={handleSubmit}
      overlay={
        isSheetOpen && <ContractSheet options={options} selectedId={selected?.id} onSelect={handleSelect} onClose={() => setIsSheetOpen(false)} />
      }
      cta={
        <Button type="submit" size="h52" className="flex-1" disabled={!selected || isSubmitting}>
          {isSubmitting ? '링크 만드는 중' : '초대 링크 보내기'}
        </Button>
      }
    >
      <div className="flex flex-col gap-1.5 pt-2">
        <h1 className="text-m-h1 font-bold text-ink">임차인을 초대하세요</h1>
        <p className="text-body text-ink-2">초대 링크로 들어온 임차인은 앱 설치 없이 계약 조회와 수리 요청을 할 수 있어요</p>
      </div>

      {!selected ? (
        <NoticeBox tone="warn">초대할 수 있는 계약이 없어요. 이미 임차인이 연결됐거나 끝난 계약이에요</NoticeBox>
      ) : (
        <>
          <TextField
            mobile
            label="임차인 휴대폰"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            placeholder="010-0000-0000"
            value={phone}
            onChange={(event) => {
              setPhone(formatPhone(event.target.value));
              setPhoneError(null);
            }}
            error={phoneError}
            hint="본인 확인에 이 번호 뒤 4자리를 써요. 바꾸면 계약의 연락처도 같이 바뀌어요"
            disabled={isSubmitting}
          />

          <div className="flex flex-col gap-1.5">
            <p id="invite-contract-label" className="text-m-label font-semibold text-ink">
              연결할 계약
            </p>
            {canChooseContract ? (
              <button
                type="button"
                aria-labelledby="invite-contract-label invite-contract-value"
                onClick={() => setIsSheetOpen(true)}
                disabled={isSubmitting}
                className="flex h-12 items-center justify-between gap-2 rounded-input border border-line bg-surface px-3.5 text-left"
              >
                <span id="invite-contract-value" className="min-w-0 truncate text-body text-ink">
                  {formatInviteContractLabel(selected)}
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
              </button>
            ) : (
              <p aria-labelledby="invite-contract-label" className="flex h-12 items-center rounded-input bg-surface-2 px-3.5 text-body text-ink">
                <span className="min-w-0 truncate">{formatInviteContractLabel(selected)}</span>
              </p>
            )}
            {listed.error && <NoticeBox>{listed.error.message}</NoticeBox>}
          </div>

          <VisibilityCard />
          <p className="rounded-input bg-surface-2 px-4 py-3 text-m-sub text-ink-3">
            역할(임차인)에 맞는 화면만 열립니다 · 초대 링크는 7일 뒤 만료됩니다
          </p>
          {submitErrorMessage && <NoticeBox>{submitErrorMessage}</NoticeBox>}
        </>
      )}
    </MobileFormLayout>
  );
};

// 임대인 앱 임차인 초대 (Figma M15, #169). 호실 상세 [기본 정보]·계약 관리의 초대 카드에서 들어온다.
// 계약서 공유 단계는 아직 없다(웹 팝업 A2와 달리 sharedDocumentIds 는 빈 배열). 링크 전달은 휴대폰 공유 창 → 안 되면 복사.
export const TenantInvitePage = ({ contractId, onUnauthorized }) => {
  const goBack = useGoBack('contractDetail', { contractId });
  const { data: contract, error } = useGetContract(contractId, { onUnauthorized });

  if (contract && isInvitableContract(contract)) {
    return <InviteForm current={contract} goBack={goBack} onUnauthorized={onUnauthorized} />;
  }

  return (
    <MobileFormLayout shell="landlord-app-form" topBar={{ title: TITLE, onBack: goBack }}>
      {contract && <NoticeBox tone="warn">이미 임차인이 앱에 연결됐거나, 끝난 계약이라 초대할 수 없어요</NoticeBox>}
      {!contract && error && <NoticeBox>{error.message}</NoticeBox>}
      {!contract && !error && <Loading />}
    </MobileFormLayout>
  );
};

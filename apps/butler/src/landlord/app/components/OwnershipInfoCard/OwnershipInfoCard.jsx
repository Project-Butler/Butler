// Created: 2026-11-25
import { useState } from 'react';
import { Button, TextField } from '@butler/ui';
import { toFieldErrors } from '../../../../shared/apiError';
import { NoticeBox } from '../../../web/components/NoticeBox/NoticeBox';
import { usePatchPropertyOwnership } from '../../../web/hooks/usePatchPropertyOwnership';
import { formatDateKST, formatNumber } from '../../../web/utils/format';
import { toPriceDigits, toYearMonthInput, validateAcquiredYearMonth, validatePurchasePrice } from '../../../web/utils/formValidation';
import { BottomSheet, useBottomSheet } from '../BottomSheet/BottomSheet';
import { CardRow, DetailCardFrame } from '../DetailCardFrame/DetailCardFrame';

// 내 소유 정보 수정 시트(취득 연월·매입가). 칸·검증·요청 본문은 웹 호실 상세 [내 소유 정보]와 같다(PATCH /property-ownerships/:id).
// 서버 입력 오류(400)는 칸 아래에, 그 밖의 오류는 시트 안 안내 박스에 보여 준다.
// 저장하면 시트가 내려간 뒤 onSaved. 저장 중에는 바깥을 눌러도 닫지 않는다(결과를 못 보고 닫히지 않게).
const OwnershipEditSheet = ({ ownership, onSaved, onClose, onUnauthorized }) => {
  const sheet = useBottomSheet();
  const patch = usePatchPropertyOwnership({ onUnauthorized });
  const [draft, setDraft] = useState(() => ({
    acquiredYearMonth: ownership.acquiredYearMonth ?? '',
    purchasePrice: ownership.purchasePrice != null ? String(ownership.purchasePrice) : '',
  }));
  const [fieldErrors, setFieldErrors] = useState({});

  const clientErrors = {
    acquiredYearMonth: validateAcquiredYearMonth(draft.acquiredYearMonth),
    purchasePrice: validatePurchasePrice(draft.purchasePrice),
  };
  const hasClientError = Boolean(clientErrors.acquiredYearMonth || clientErrors.purchasePrice);

  const updateDraft = (name, value) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSave = async () => {
    if (hasClientError) return;
    const { data, error } = await patch.updateOwnership(ownership.id, {
      acquiredYearMonth: draft.acquiredYearMonth || null,
      purchasePrice: draft.purchasePrice ? Number(draft.purchasePrice) : null,
    });
    if (data) {
      sheet.close(onSaved);
      return;
    }
    if (error?.status === 400) setFieldErrors(toFieldErrors(error));
  };

  const showErrorBox = patch.error && !(patch.error.status === 400 && (fieldErrors.acquiredYearMonth || fieldErrors.purchasePrice));

  return (
    <BottomSheet label="내 소유 정보 수정" onClose={onClose} closeDisabled={patch.isLoading} sheet={sheet}>
      <TextField
        mobile
        label="취득 연월"
        numeric
        inputMode="numeric"
        placeholder="2019-03"
        maxLength={7}
        value={draft.acquiredYearMonth}
        onChange={(event) => updateDraft('acquiredYearMonth', toYearMonthInput(event.target.value))}
        error={clientErrors.acquiredYearMonth ?? fieldErrors.acquiredYearMonth}
        disabled={patch.isLoading}
      />
      <TextField
        mobile
        label="매입가"
        suffix="원"
        numeric
        inputMode="numeric"
        maxLength={22}
        value={draft.purchasePrice ? formatNumber(draft.purchasePrice) : ''}
        onChange={(event) => updateDraft('purchasePrice', toPriceDigits(event.target.value))}
        error={clientErrors.purchasePrice ?? fieldErrors.purchasePrice}
        disabled={patch.isLoading}
      />
      <p className="text-m-sub text-ink-3">인증일·인증 만료일·소유 시작은 바꿀 수 없어요.</p>
      {showErrorBox && <NoticeBox>{patch.error.message}</NoticeBox>}
      <div className="flex gap-2.5">
        <Button variant="secondary" size="h52" className="flex-1" onClick={() => sheet.close(onClose)} disabled={patch.isLoading}>
          취소
        </Button>
        <Button size="h52" className="flex-1" onClick={handleSave} disabled={hasClientError || patch.isLoading}>
          {patch.isLoading ? '저장 중' : '저장'}
        </Button>
      </div>
    </BottomSheet>
  );
};

// 앱 부동산 상세 [기본 정보]의 내 소유 정보 카드. 줄·문구는 웹 호실 상세 [내 소유 정보]와 같다.
// 지금 소유 중이면 [수정]이 하단 시트를 연다. 끝난 소유 관계는 조회만 하고 '소유 종료' 날짜를 더 보여 준다.
// 호실 삭제(소유 종료)는 상단 ⋯ 메뉴가 맡는다. onSaved: 저장하면 소유 관계를 다시 읽는다.
export const OwnershipInfoCard = ({ ownership, onSaved, onUnauthorized }) => {
  const [isEditing, setIsEditing] = useState(false);
  const isVerified = ownership.verificationStatus === 'VERIFIED';

  const handleSaved = () => {
    setIsEditing(false);
    onSaved();
  };

  return (
    <DetailCardFrame title="내 소유 정보" onEdit={ownership.isActive ? () => setIsEditing(true) : undefined}>
      <dl>
        <CardRow label="취득 연월" value={ownership.acquiredYearMonth} numeric />
        <CardRow label="매입가" value={ownership.purchasePrice != null ? `${formatNumber(ownership.purchasePrice)}원` : null} numeric />
        <CardRow label="인증일" value={formatDateKST(ownership.verifiedAt)} numeric seal={isVerified} />
        <CardRow label="인증 만료일" value={formatDateKST(ownership.verificationExpiresAt)} numeric seal={isVerified} />
        <CardRow label="소유 시작" value={formatDateKST(ownership.startedAt)} numeric />
        {!ownership.isActive && <CardRow label="소유 종료" value={formatDateKST(ownership.endedAt)} numeric />}
      </dl>
      {isEditing && (
        <OwnershipEditSheet ownership={ownership} onSaved={handleSaved} onClose={() => setIsEditing(false)} onUnauthorized={onUnauthorized} />
      )}
    </DetailCardFrame>
  );
};

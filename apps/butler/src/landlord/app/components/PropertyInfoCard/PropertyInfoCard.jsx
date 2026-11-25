// Created: 2026-11-25
import { useState } from 'react';
import { Button, TextField } from '@butler/ui';
import { toFieldErrors } from '../../../../shared/apiError';
import { NoticeBox } from '../../../web/components/NoticeBox/NoticeBox';
import { usePatchProperty } from '../../../web/hooks/usePatchProperty';
import { formatFloor, parseFloorInput, toFloorText, validateFloorInput } from '../../../web/utils/floor';
import { formatDateKST } from '../../../web/utils/format';
import { toAreaInput, validateExclusiveArea } from '../../../web/utils/formValidation';
import { formatUnitLabel } from '../../../web/utils/unitAddress';
import { BottomSheet } from '../BottomSheet/BottomSheet';
import { CardRow, DetailCardFrame } from '../DetailCardFrame/DetailCardFrame';

// 호실 정보 수정 시트(전용면적·층). 칸·검증·요청 본문은 웹 호실 상세 [호실 정보]와 같다(PATCH /properties/:id).
// 서버 입력 오류(400)는 칸 아래에, 그 밖의 오류(403: 그 사이 인증이 끝남 등)는 시트 안 안내 박스에 보여 준다.
const PropertyInfoEditSheet = ({ property, onSaved, onClose, onUnauthorized }) => {
  const patch = usePatchProperty({ onUnauthorized });
  const [draft, setDraft] = useState(() => ({
    exclusiveArea: property.exclusiveArea != null ? String(property.exclusiveArea) : '',
    floor: toFloorText(property.floor),
  }));
  const [fieldErrors, setFieldErrors] = useState({});

  const clientErrors = { exclusiveArea: validateExclusiveArea(draft.exclusiveArea), floor: validateFloorInput(draft.floor) };
  const hasClientError = Boolean(clientErrors.exclusiveArea || clientErrors.floor);

  const updateDraft = (name, value) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSave = async () => {
    if (hasClientError) return;
    const { data, error } = await patch.updateProperty(property.id, {
      exclusiveArea: draft.exclusiveArea ? Number(draft.exclusiveArea) : null,
      floor: parseFloorInput(draft.floor),
    });
    if (data) {
      onSaved();
      return;
    }
    if (error?.status === 400) setFieldErrors(toFieldErrors(error));
  };

  const showErrorBox = patch.error && !(patch.error.status === 400 && (fieldErrors.exclusiveArea || fieldErrors.floor));

  // 저장 중에는 바깥을 눌러도 닫지 않는다(결과를 못 보고 닫히지 않게).
  const handleClose = () => {
    if (!patch.isLoading) onClose();
  };

  return (
    <BottomSheet label="호실 정보 수정" onClose={handleClose}>
      <TextField
        mobile
        label="전용면적"
        suffix="m²"
        numeric
        value={draft.exclusiveArea}
        onChange={(event) => updateDraft('exclusiveArea', toAreaInput(event.target.value))}
        error={clientErrors.exclusiveArea ?? fieldErrors.exclusiveArea}
        disabled={patch.isLoading}
      />
      <TextField
        mobile
        label="층"
        placeholder="12 또는 B1"
        hint="지하는 B1처럼 적어요"
        value={draft.floor}
        onChange={(event) => updateDraft('floor', event.target.value)}
        error={clientErrors.floor ?? fieldErrors.floor}
        disabled={patch.isLoading}
      />
      <p className="text-m-sub text-ink-3">주소·동·호는 바꿀 수 없어요.</p>
      {showErrorBox && <NoticeBox>{patch.error.message}</NoticeBox>}
      <div className="flex gap-2.5">
        <Button variant="secondary" size="h52" className="flex-1" onClick={onClose} disabled={patch.isLoading}>
          취소
        </Button>
        <Button size="h52" className="flex-1" onClick={handleSave} disabled={hasClientError || patch.isLoading}>
          {patch.isLoading ? '저장 중' : '저장'}
        </Button>
      </div>
    </BottomSheet>
  );
};

// 앱 부동산 상세 [기본 정보]의 호실 정보 카드(주소·법정동·동호·면적·층·등록일). 층은 값이 있을 때만 줄을 둔다.
// 면적·층은 권리자 인증을 마친 지금 소유자만 [수정](하단 시트)으로 고친다(웹과 같은 조건).
// 인증 전인 지금 소유자에게는 인증 후 고칠 수 있다고 알리고, 예전 소유·다른 관계에는 버튼도 안내도 두지 않는다.
// onSaved: 저장하면 호실을 다시 읽는다.
export const PropertyInfoCard = ({ property, complex, onSaved, onUnauthorized }) => {
  const [isEditing, setIsEditing] = useState(false);
  const relation = property.myRelation;
  const isOwner = relation?.type === 'OWNER';
  const canEdit = isOwner && relation.verificationStatus === 'VERIFIED';
  const floor = formatFloor(property.floor);

  const handleSaved = () => {
    setIsEditing(false);
    onSaved();
  };

  return (
    <DetailCardFrame title="호실 정보" onEdit={canEdit ? () => setIsEditing(true) : undefined}>
      {isOwner && !canEdit && <p className="pb-2 text-m-sub text-ink-3">면적·층은 권리자 인증 후 수정할 수 있습니다</p>}
      <dl>
        <CardRow label="주소" value={complex?.roadAddress ?? complex?.jibunAddress ?? property.complex.roadAddress} />
        <CardRow label="법정동" value={complex?.region?.fullName} />
        <CardRow label="동·호" value={formatUnitLabel(property.buildingNo, property.unitNo)} />
        <CardRow label="전용면적" value={property.exclusiveArea != null ? `${property.exclusiveArea}m²` : null} numeric />
        {floor && <CardRow label="층" value={floor} numeric />}
        <CardRow label="등록일" value={formatDateKST(property.createdAt)} numeric />
      </dl>
      {isEditing && (
        <PropertyInfoEditSheet property={property} onSaved={handleSaved} onClose={() => setIsEditing(false)} onUnauthorized={onUnauthorized} />
      )}
    </DetailCardFrame>
  );
};

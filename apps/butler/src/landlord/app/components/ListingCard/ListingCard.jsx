// Created: 2026-11-25
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, TextField } from '@butler/ui';
import { NoticeBox } from '../../../web/components/NoticeBox/NoticeBox';
import { usePatchPropertyOwnership } from '../../../web/hooks/usePatchPropertyOwnership';
import {
  EQUIPMENT_OPTIONS,
  formatEquipment,
  getUnitTypeLabel,
  MAX_EQUIPMENT_ETC_LENGTH,
  UNIT_TYPE_OPTIONS,
} from '../../../web/utils/unitListing';
import { BottomSheet } from '../BottomSheet/BottomSheet';
import { CheckboxChip } from '../CheckboxChip/CheckboxChip';
import { CardRow, DetailCardFrame } from '../DetailCardFrame/DetailCardFrame';

const SELECT_CLASS =
  'h-12 w-full rounded-input border border-line bg-surface px-3.5 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2 disabled:text-ink-3';

// 임대 조건 수정 시트. 칸·검증·요청 본문은 웹 호실 상세 [임대 조건]과 같다(PATCH /property-ownerships/:id).
const ListingEditSheet = ({ ownership, onSaved, onClose, onUnauthorized }) => {
  const patch = usePatchPropertyOwnership({ onUnauthorized });
  const [draft, setDraft] = useState(() => ({
    unitType: ownership.unitType ?? '',
    equipment: ownership.equipment ?? [],
    equipmentEtc: ownership.equipmentEtc ?? '',
  }));

  const etcError =
    draft.equipmentEtc.trim().length > MAX_EQUIPMENT_ETC_LENGTH ? `${MAX_EQUIPMENT_ETC_LENGTH}자 이하로 입력해 주세요.` : undefined;

  const toggleEquipment = (code) =>
    setDraft((prev) => ({
      ...prev,
      equipment: prev.equipment.includes(code) ? prev.equipment.filter((value) => value !== code) : [...prev.equipment, code],
    }));

  const handleSave = async () => {
    if (etcError) return;
    const { data } = await patch.updateOwnership(ownership.id, {
      unitType: draft.unitType || null,
      equipment: draft.equipment,
      equipmentEtc: draft.equipmentEtc.trim() || null,
    });
    if (data) onSaved();
  };

  // 저장 중에는 바깥을 눌러도 닫지 않는다(결과를 못 보고 닫히지 않게).
  const handleClose = () => {
    if (!patch.isLoading) onClose();
  };

  return (
    <BottomSheet label="임대 조건 수정" onClose={handleClose}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="app-listing-unit-type" className="text-m-label font-semibold text-ink">
          방 구성
        </label>
        <select
          id="app-listing-unit-type"
          value={draft.unitType}
          onChange={(event) => setDraft((prev) => ({ ...prev, unitType: event.target.value }))}
          disabled={patch.isLoading}
          className={SELECT_CLASS}
        >
          <option value="">선택 안 함</option>
          {UNIT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-m-label font-semibold text-ink">설비</p>
        <div className="grid grid-cols-3 gap-2">
          {EQUIPMENT_OPTIONS.map((option) => (
            <CheckboxChip
              key={option.value}
              label={option.label}
              checked={draft.equipment.includes(option.value)}
              onChange={() => toggleEquipment(option.value)}
              disabled={patch.isLoading}
            />
          ))}
        </div>
      </div>
      <TextField
        mobile
        label="기타 설비"
        placeholder="예: 커튼, 블라인드"
        maxLength={MAX_EQUIPMENT_ETC_LENGTH}
        value={draft.equipmentEtc}
        onChange={(event) => setDraft((prev) => ({ ...prev, equipmentEtc: event.target.value }))}
        error={etcError}
        disabled={patch.isLoading}
      />
      {patch.error && <NoticeBox>{patch.error.message}</NoticeBox>}
      <div className="flex gap-2.5">
        <Button variant="secondary" size="h52" className="flex-1" onClick={onClose} disabled={patch.isLoading}>
          취소
        </Button>
        <Button size="h52" className="flex-1" onClick={handleSave} disabled={Boolean(etcError) || patch.isLoading}>
          {patch.isLoading ? '저장 중' : '저장'}
        </Button>
      </div>
    </BottomSheet>
  );
};

// 앱 부동산 상세 [기본 정보]의 임대 조건 카드(방 구성·설비). 웹 호실 상세 [임대 조건]과 같은 값·문구를 쓴다.
// 지금 소유 중이면 [수정]이 하단 시트를 열고, 비어 있으면 점선 버튼으로 입력을 권한다. 끝난 소유 관계는 조회만.
// onSaved: 저장하면 소유 관계를 다시 읽는다.
export const ListingCard = ({ ownership, onSaved, onUnauthorized }) => {
  const [isEditing, setIsEditing] = useState(false);
  const unitType = getUnitTypeLabel(ownership.unitType);
  const equipment = formatEquipment(ownership.equipment, ownership.equipmentEtc);
  const isEmpty = !unitType && !equipment;
  const canEdit = ownership.isActive;

  const handleSaved = () => {
    setIsEditing(false);
    onSaved();
  };

  return (
    <DetailCardFrame title="임대 조건" onEdit={canEdit ? () => setIsEditing(true) : undefined}>
      {!isEmpty && (
        <dl>
          <CardRow label="방 구성" value={unitType} />
          <CardRow label="설비" value={equipment} />
        </dl>
      )}
      {isEmpty &&
        (canEdit ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="mb-4 flex w-full items-center gap-3 rounded-input border border-dashed border-dash px-4 py-3 text-left text-m-sub text-ink-3"
          >
            <Plus size={16} aria-hidden="true" />
            방 구성·설비를 넣으면 계약할 때 편해요 (선택)
          </button>
        ) : (
          <p className="pb-4 text-m-sub text-ink-3">입력한 방 구성·설비가 없어요.</p>
        ))}
      {isEditing && (
        <ListingEditSheet ownership={ownership} onSaved={handleSaved} onClose={() => setIsEditing(false)} onUnauthorized={onUnauthorized} />
      )}
    </DetailCardFrame>
  );
};

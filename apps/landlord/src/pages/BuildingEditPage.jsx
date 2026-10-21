import { useState } from 'react';
import { Button, Card, TextField } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useDeleteLandlordBuilding } from '../hooks/useDeleteLandlordBuilding';
import { useGetLandlordBuilding } from '../hooks/useGetLandlordBuilding';
import { usePatchLandlordBuilding } from '../hooks/usePatchLandlordBuilding';
import { toFieldErrors } from '../utils/apiError';

// 서버 검증(apps/api landlordBuildings controller)과 같은 범위
const MAX_NAME_LENGTH = 50;
const MAX_MEMO_LENGTH = 500;

const validateDraft = (draft) => {
  const errors = {};
  const nameLength = draft.name.trim().length;
  if (nameLength < 1 || nameLength > MAX_NAME_LENGTH) errors.name = `1~${MAX_NAME_LENGTH}자로 입력해 주세요.`;
  if (draft.memo.trim().length > MAX_MEMO_LENGTH) errors.memo = `${MAX_MEMO_LENGTH}자 이하로 입력해 주세요.`;
  return errors;
};

const toDraft = (building) => ({ name: building.name, memo: building.memo ?? '' });

// 이름·설명 수정. 주소(단지)는 바꿀 수 없다(보기만). 호실 수 제한은 두지 않는다(capacity: null로 저장).
const BuildingEditForm = ({ building, onNavigate, onUnauthorized }) => {
  const patch = usePatchLandlordBuilding({ onUnauthorized });
  const remove = useDeleteLandlordBuilding({ onUnauthorized });
  const [draft, setDraft] = useState(() => toDraft(building));
  const [serverFieldErrors, setServerFieldErrors] = useState({});
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const clientErrors = validateDraft(draft);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];
  const hasClientError = Object.keys(clientErrors).length > 0;
  const isBusy = patch.isLoading || remove.isLoading;

  const updateField = (name, value) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
    setServerFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSave = async (event) => {
    event?.preventDefault();
    if (hasClientError || isBusy) return;
    const { data, error } = await patch.updateBuilding(building.id, {
      name: draft.name.trim(),
      capacity: null,
      memo: draft.memo.trim() || null,
    });
    if (data) {
      window.history.back();
      return;
    }
    if (error?.status === 400) setServerFieldErrors(toFieldErrors(error));
  };

  const handleDelete = async () => {
    const { data } = await remove.deleteBuilding(building.id);
    // 상세·수정 기록이 남아 있어도 목록으로 바꿔 둔다(지운 건물로 뒤로 가지 않게).
    if (data) onNavigate('buildingList', {}, { replace: true });
  };

  const showPatchError =
    patch.error && !(patch.error.status === 400 && Object.keys(serverFieldErrors).some((key) => serverFieldErrors[key]));

  return (
    <div className="grid grid-cols-3 items-start gap-6">
      <form onSubmit={handleSave} className="col-span-2">
        <Card className="space-y-6 p-6">
          <div className="flex flex-col gap-1.5">
            <p className="text-label font-semibold text-ink">주소</p>
            <p className="rounded-input bg-surface-2 px-4 py-3 text-card text-ink-2">
              {building.complex.roadAddress ?? building.complex.name}
            </p>
            <p className="text-chip text-ink-3">주소는 바꿀 수 없어요. 다른 주소라면 건물을 새로 등록해 주세요</p>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <TextField
              label="건물명"
              maxLength={MAX_NAME_LENGTH}
              value={draft.name}
              onChange={(event) => updateField('name', event.target.value)}
              error={fieldError('name')}
              disabled={isBusy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="building-edit-memo" className="text-label font-semibold text-ink">
              설명 (선택)
            </label>
            <textarea
              id="building-edit-memo"
              rows={4}
              maxLength={MAX_MEMO_LENGTH}
              value={draft.memo}
              onChange={(event) => updateField('memo', event.target.value)}
              disabled={isBusy}
              className="rounded-input border border-line px-4 py-3 text-card text-ink outline-none focus:border-accent"
            />
            {fieldError('memo') && <p className="text-chip text-crit-ink">{fieldError('memo')}</p>}
          </div>

          {showPatchError && <NoticeBox>{patch.error.message}</NoticeBox>}

          <div className="flex justify-end gap-3 border-t border-line pt-5">
            <Button type="button" variant="secondary" onClick={() => window.history.back()} disabled={isBusy}>
              취소
            </Button>
            <Button type="submit" disabled={hasClientError || isBusy}>
              {patch.isLoading ? '저장 중' : '저장'}
            </Button>
          </div>
        </Card>
      </form>

      <Card className="space-y-3 p-6">
        <h2 className="text-section font-semibold text-ink">건물 삭제</h2>
        {isConfirmingDelete ? (
          <>
            <p className="text-sub text-ink-2">이 건물을 삭제할까요? 등록한 호실이 있으면 삭제할 수 없어요. 호실을 먼저 삭제해 주세요.</p>
            {remove.error && <NoticeBox>{remove.error.message}</NoticeBox>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsConfirmingDelete(false)} disabled={remove.isLoading}>
                취소
              </Button>
              <Button onClick={handleDelete} disabled={remove.isLoading}>
                {remove.isLoading ? '삭제 중' : '삭제'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sub text-ink-3">호실이 없는 건물만 삭제할 수 있어요 (지금 {building.propertyCount}개)</p>
            <Button
              variant="secondary"
              onClick={() => {
                remove.reset();
                setIsConfirmingDelete(true);
              }}
              disabled={isBusy}
            >
              건물 삭제
            </Button>
          </>
        )}
      </Card>
    </div>
  );
};

export const BuildingEditPage = ({ landlordBuildingId, onNavigate, onUnauthorized }) => {
  const buildingQuery = useGetLandlordBuilding(landlordBuildingId, { onUnauthorized });
  const building = buildingQuery.data;

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader title="건물 수정" description={building?.name} onBack={() => window.history.back()} />
      {buildingQuery.error && <NoticeBox>{buildingQuery.error.message}</NoticeBox>}
      {!building && !buildingQuery.error && <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>}
      {building && (
        <BuildingEditForm key={building.id} building={building} onNavigate={onNavigate} onUnauthorized={onUnauthorized} />
      )}
    </div>
  );
};

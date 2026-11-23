import { useState } from 'react';
import { Button } from '@butler/ui';
import { Archive, Trash2 } from 'lucide-react';
import { IconTile } from '../IconTile/IconTile';
import { Modal } from '../Modal/Modal';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { usePostOwnershipRemove } from '../../hooks/usePostOwnershipRemove';

// 소유가 끝난 호실(매도 뒤 판 사람, H-41) 안내 띠 + [목록에서 지우기].
// 목록에서 지우기는 되돌릴 수 없어 확인 팝업을 거친다. 성공하면 onRemoved(하우스 로그 첫 화면으로).
export const SoldHomeBanner = ({ ownershipId, endedOn, isSold, onRemoved, onUnauthorized }) => {
  const remove = usePostOwnershipRemove({ onUnauthorized });
  const [isConfirming, setIsConfirming] = useState(false);

  const handleRemove = async () => {
    const { ok } = await remove.remove(ownershipId);
    if (ok) {
      setIsConfirming(false);
      onRemoved();
    }
  };
  const closeConfirm = () => {
    if (remove.isLoading) return;
    remove.reset();
    setIsConfirming(false);
  };

  return (
    <section className="flex items-center gap-4 rounded-card border border-line bg-surface-2 px-5 py-4" aria-label="소유가 끝난 호실">
      <IconTile icon={Archive} tone="mute" />
      <div className="min-w-0 flex-1">
        <p className="text-card-sm font-semibold text-ink">
          {endedOn}에 {isSold ? '매도한' : '소유가 끝난'} 호실이에요
        </p>
        <p className="mt-0.5 text-sub text-ink-2">
          넘어간 이력은 고칠 수 없고 <b>내 화면에서 삭제</b>만 돼요(새 임대인에게는 그대로). 이후에 남기는 기록·파일은 나만 봐요.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-btn border border-line bg-surface px-4 text-body font-semibold text-ink hover:bg-surface-2"
      >
        <Trash2 size={16} className="text-crit" aria-hidden="true" />
        목록에서 지우기
      </button>

      {isConfirming && (
        <Modal
          title="이 호실을 목록에서 지울까요?"
          icon={Trash2}
          iconTone="crit"
          onClose={closeConfirm}
          footer={
            <>
              <Button variant="secondary" size="h44" onClick={closeConfirm} disabled={remove.isLoading}>
                취소
              </Button>
              <Button size="h44" onClick={handleRemove} disabled={remove.isLoading}>
                {remove.isLoading ? '지우는 중' : '목록에서 지우기'}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-body text-ink-2">
            <p>
              이 호실에 남긴 <b>나만 보기 기록과 파일이 모두 지워지고</b>, 하우스 로그·내 부동산 목록에서 빠져요. <b>되돌릴 수 없어요.</b>
            </p>
            <p className="text-sub text-ink-3">새 임대인에게 넘어간 호실 이력은 그대로 남아요. 계약 기록은 지우지 않고 목록에서만 빠져요.</p>
            {remove.error && <NoticeBox>{remove.error.message}</NoticeBox>}
          </div>
        </Modal>
      )}
    </section>
  );
};

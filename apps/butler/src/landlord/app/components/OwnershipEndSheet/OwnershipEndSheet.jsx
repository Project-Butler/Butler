// Created: 2026-11-25
import { useState } from 'react';
import { Button, SegmentedControl } from '@butler/ui';
import { NoticeBox } from '../../../web/components/NoticeBox/NoticeBox';
import { usePostPropertyOwnershipEnd } from '../../../web/hooks/usePostPropertyOwnershipEnd';
import { END_REASONS, isSoldReason, toOwnershipEndBody } from '../../../web/utils/ownershipVerification';
import { BottomSheet, useBottomSheet } from '../BottomSheet/BottomSheet';

const REASON_OPTIONS = END_REASONS.map(({ label }) => ({ value: label, label }));

// 호실 삭제(= 내 소유 관계 종료, POST /property-ownerships/:id/end) 확인 시트. 문구·사유·요청은 웹 호실 상세 [내 소유 정보]와 같다.
// 종료 사유는 고르지 않아도 되고, 고른 칸을 다시 누르면 풀린다. 매도(SOLD)만 진행 중 계약이 있어도 끝난다.
// 끝나면 시트가 내려간 뒤 onEnded, 실패하면 서버 message 를 시트 안에 보여 준다(진행 중 계약이 있으면 서버가 막는다).
// 요청 중에는 바깥을 눌러도 닫지 않는다(결과를 못 보고 닫히지 않게).
export const OwnershipEndSheet = ({ ownershipId, onEnded, onClose, onUnauthorized }) => {
  const sheet = useBottomSheet();
  const end = usePostPropertyOwnershipEnd({ onUnauthorized });
  const [reason, setReason] = useState(null);

  const handleEnd = async () => {
    const { data } = await end.endOwnership(ownershipId, toOwnershipEndBody(reason));
    if (data) sheet.close(onEnded);
  };

  return (
    <BottomSheet label="호실 삭제" onClose={onClose} closeDisabled={end.isLoading} sheet={sheet}>
      <div className="flex flex-col gap-1">
        <p className="text-body font-semibold text-ink">이 호실을 삭제할까요?</p>
        <p className="text-m-sub text-ink-2">
          내 소유 관계를 종료합니다. 되돌릴 수 없고 &apos;예전 소유 호실&apos;로 옮겨지며, 건물의 등록 호실 수에서 빠집니다.{' '}
          {isSoldReason(reason)
            ? '매도는 진행 중인 계약이 있어도 종료돼요. 계약은 수정·해지할 수 없고 보기만 할 수 있어요.'
            : "진행 중인 계약이 있으면 삭제할 수 없어요. 호실을 팔았다면 '매도'를 골라 주세요."}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-m-label font-semibold text-ink">종료 사유 (선택)</p>
        <SegmentedControl
          ariaLabel="종료 사유"
          options={REASON_OPTIONS}
          value={reason}
          onChange={(value) => setReason((prev) => (prev === value ? null : value))}
        />
      </div>
      {end.error && <NoticeBox>{end.error.message}</NoticeBox>}
      <div className="flex gap-2.5">
        <Button variant="secondary" size="h52" className="flex-1" onClick={() => sheet.close(onClose)} disabled={end.isLoading}>
          취소
        </Button>
        <Button size="h52" className="flex-1" onClick={handleEnd} disabled={end.isLoading}>
          {end.isLoading ? '삭제 중' : '호실 삭제'}
        </Button>
      </div>
    </BottomSheet>
  );
};

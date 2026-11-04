import { Button } from '@butler/ui';
import { NoticeBox } from '../NoticeBox/NoticeBox';

// 글쓰기 자격이 없을 때의 안내 띠(미인증 · 인증 만료일 때만). 미인증은 "글을 쓰려면 권리자 인증이 필요합니다" + "권리자 인증하기",
// 만료는 "인증이 만료되어 글을 쓸 수 없습니다" + "다시 인증하기".
// 인증 화면(다른 담당)이 아직 없어서 버튼은 비활성.
// writeBlockedReason: 목록·상세 응답의 null | 'UNVERIFIED' | 'EXPIRED'
export const getBlockedMessage = (writeBlockedReason) =>
  writeBlockedReason === 'EXPIRED' ? '인증이 만료되어 글을 쓸 수 없습니다' : '글을 쓰려면 권리자 인증이 필요합니다';

export const BoardNotice = ({ writeBlockedReason }) => {
  if (!writeBlockedReason) return null;
  return (
    <NoticeBox tone="warn">
      <div className="flex items-center justify-between gap-3">
        <span>{getBlockedMessage(writeBlockedReason)}</span>
        <Button variant="verifyOutline" size="sm" disabled className="flex-none">
          {writeBlockedReason === 'EXPIRED' ? '다시 인증하기' : '권리자 인증하기'}
        </Button>
      </div>
    </NoticeBox>
  );
};

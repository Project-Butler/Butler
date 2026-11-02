import { Button } from '@butler/ui';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { VERIFICATION_FAILED_MESSAGE } from '../../utils/ownershipVerification';

// 인증 실패 안내. 임대인에게는 상세 사유를 보여 주지 않는다(계획 4장 존재 노출 방지).
export const VerificationFailedNotice = ({ onInquiry }) => (
  <NoticeBox className="flex flex-wrap items-center justify-between gap-3">
    <span>{VERIFICATION_FAILED_MESSAGE}</span>
    <Button variant="secondary" size="sm" className="shrink-0" onClick={onInquiry}>
      문의하기
    </Button>
  </NoticeBox>
);

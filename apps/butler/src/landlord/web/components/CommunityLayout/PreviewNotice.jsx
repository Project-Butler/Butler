import { Button } from '@butler/ui';
import { NoticeBox } from '../NoticeBox/NoticeBox';

// 미리보기 안내 문구 — 앱 화면(app CommunityAppFrame)도 같은 문구를 쓴다
export const PREVIEW_NOTICE_TEXT = '권리자 인증을 마치면 글을 읽고 투표에 참여할 수 있어요';

// 인증 전 미리보기 중 탭 줄 아래 한 줄 + [권리자 인증하기](남색 — 인증 안내에만 쓰는 색).
// onVerify: 권리자 인증 화면으로 가는 함수. 갈 호실을 모르면 비워 두고 버튼을 막는다.
export const PreviewNotice = ({ onVerify }) => (
  <NoticeBox tone="seal">
    <div className="flex items-center justify-between gap-3">
      <span className="break-keep">{PREVIEW_NOTICE_TEXT}</span>
      <Button variant="verify" size="sm" className="flex-none" onClick={onVerify} disabled={!onVerify}>
        권리자 인증하기
      </Button>
    </div>
  </NoticeBox>
);

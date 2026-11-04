import { Button, Card, TextField } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';

// 관리자 문의(/support/inquiry). 지금은 화면만 있고 저장·전송하지 않는다(계획 V-09).
export const SupportInquiryPage = () => (
  <div className="w-full max-w-2xl space-y-6 pb-10">
    <PageHeader
      title="관리자 문의"
      description="권리자 인증이나 호실 소유 관계에 문제가 있으면 알려 주세요."
      onBack={() => window.history.back()}
    />
    <NoticeBox tone="warn">문의 접수는 준비 중이에요. 지금은 입력하거나 보낼 수 없어요.</NoticeBox>
    <Card className="space-y-5 p-6">
      <TextField label="호실" placeholder="예: 항여울 116동 712호" disabled />
      <TextField label="제목" placeholder="문의 제목" disabled />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="inquiry-content" className="text-label font-semibold text-ink">
          내용
        </label>
        <textarea
          id="inquiry-content"
          rows={5}
          disabled
          placeholder="문의 내용"
          className="resize-none rounded-input border border-line bg-surface-2 px-3.5 py-2.5 text-body text-ink-3 outline-none disabled:cursor-not-allowed"
        />
      </div>
      <div className="flex justify-end">
        <Button disabled>문의 보내기</Button>
      </div>
    </Card>
  </div>
);

import { Building2, Clock, ShieldAlert, StickyNote } from 'lucide-react';
import { Button, TextField } from '@butler/ui';
import { FormNoticeStrip, FormPageLayout } from '../components/FormPageLayout/FormPageLayout';
import { FormSection } from '../components/FormSection/FormSection';
import { IconTile } from '../components/IconTile/IconTile';

// 관리자 문의(/support/inquiry). 지금은 화면만 있고 저장·전송하지 않는다(계획 V-09). 칸·버튼은 모두 잠가 둔다.
export const SupportInquiryPage = () => {
  const actions = (place) => (
    <>
      <Button type="button" variant="secondary" size={place === 'header' ? 'h44' : 'h48'} onClick={() => window.history.back()}>
        취소
      </Button>
      <Button type="button" size={place === 'header' ? 'h44' : 'h48'} disabled>
        문의 보내기
      </Button>
    </>
  );

  return (
    <FormPageLayout
      className="support-page"
      title="관리자 문의"
      description="권리자 인증이나 호실 소유 관계에 문제가 있으면 알려 주세요."
      actions={actions}
      onSubmit={() => {}}
      showRequiredHint={false}
      notice={<FormNoticeStrip icon={Clock}>문의 접수는 준비 중이에요. 지금은 입력하거나 보낼 수 없어요.</FormNoticeStrip>}
      summary={
        <div className="space-y-3 rounded-card border border-line bg-surface p-5">
          <IconTile icon={ShieldAlert} tone="seal" />
          <p className="text-section font-semibold text-ink">이럴 때 문의해요</p>
          <p className="text-body text-ink-2">권리자 인증이 계속 실패하거나, 다른 사람이 내 호실을 등록한 것 같을 때</p>
        </div>
      }
    >
      <FormSection icon={Building2} title="호실" description="문의할 호실">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <TextField label="호실" placeholder="예: 항여울 116동 712호" disabled />
          </div>
        </div>
      </FormSection>
      <FormSection icon={StickyNote} title="내용" description="자세히 적을수록 빨라요">
        <TextField label="제목" placeholder="예: 인증이 계속 실패해요" disabled />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="inquiry-content" className="text-label font-semibold text-ink">
            내용
          </label>
          <textarea
            id="inquiry-content"
            rows={4}
            disabled
            placeholder="어떤 문제가 있는지 적어 주세요"
            className="resize-none rounded-input border border-line bg-surface-2 px-4 py-3 text-card text-ink-3 outline-none disabled:cursor-not-allowed"
          />
        </div>
      </FormSection>
    </FormPageLayout>
  );
};

import { Button } from '@butler/ui';

// 순서대로 모드 임시 저장이 있을 때 "이어서 할까요?"
export const DraftResumeNotice = ({ description, onResume, onDiscard }) => (
  <div className="flex items-center justify-between gap-4 rounded-input bg-accent-soft px-4 py-3">
    <div className="min-w-0">
      <p className="text-body font-semibold text-accent-strong">작성하던 내용이 있어요. 이어서 할까요?</p>
      {description && <p className="mt-0.5 truncate text-sub text-ink-2">{description}</p>}
    </div>
    <div className="flex shrink-0 gap-2">
      <Button variant="secondary" size="sm" onClick={onDiscard}>
        처음부터
      </Button>
      <Button size="sm" onClick={onResume}>
        이어서 하기
      </Button>
    </div>
  </div>
);

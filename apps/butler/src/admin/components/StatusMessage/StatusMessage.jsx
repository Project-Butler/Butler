import { Button } from '@butler/ui';

// 불러오는 중·오류·빈 목록 안내. onRetry를 주면 [다시 시도] 버튼을 붙인다.
export const StatusMessage = ({ children, onRetry, tone = 'neutral', className = '' }) => (
  <div className={`flex flex-col items-center gap-3 py-8 text-center ${className}`}>
    <p role={tone === 'error' ? 'alert' : 'status'} className={`text-body ${tone === 'error' ? 'text-crit-ink' : 'text-ink-3'}`}>
      {children}
    </p>
    {onRetry && (
      <Button variant="secondary" size="sm" onClick={onRetry}>
        다시 시도
      </Button>
    )}
  </div>
);

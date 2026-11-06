// 세션 확인·화면 내려받기처럼 잠깐 기다리는 동안 보여 주는 전체 화면 안내.
export const FullScreenStatus = ({ children }) => (
  <p role="status" className="flex min-h-screen items-center justify-center bg-ground text-body text-ink-3">
    {children}
  </p>
);

// 개발용 미리보기 진입점(dispute-chat.html). 레이아웃(LandlordLayout)에 붙이기 전에
// AI 분쟁 상담 화면만 로그인 → 상담 순서로 띄워서 확인한다.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from '@butler/ui';
import { postLogin } from '@butler/api-client';
import { DisputeChatPage } from '../pages/DisputeChatPage';
import '../index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const Preview = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  if (!isLoggedIn) {
    return (
      <LoginScreen
        brand="Butler"
        subtitle="AI 분쟁 상담 미리보기"
        devHint="fixture 계정: landlord@butler.test / password123"
        onSubmit={async (credentials) => {
          await postLogin(credentials);
          setIsLoggedIn(true);
        }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-6 lg:px-10 lg:py-8">
      <DisputeChatPage />
    </main>
  );
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Preview />
    </QueryClientProvider>
  </StrictMode>,
);

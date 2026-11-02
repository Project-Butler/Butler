// 개발용 미리보기 진입점(dispute-preview.html). 분쟁 해결사 화면을 사이드바(AppShell) 없이 띄워
// 모바일 폭에서 어떻게 보이는지 확인한다. 화면 이동은 주소창이 아니라 메모리 안에서만 한다.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from '@butler/ui';
import { postLogin } from '@butler/api-client';
import { DisputeChatPage } from '../pages/DisputeChatPage';
import { DisputePage } from '../pages/DisputePage';
import { DisputeReferenceDetailPage } from '../pages/DisputeReferenceDetailPage';
import { DisputeSearchPage } from '../pages/DisputeSearchPage';
import { buildLocation } from '../routes';
import '../index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const Screens = () => {
  const navigate = useNavigate();
  const onNavigate = (key, params = {}) => {
    const { pathname, search = '', state } = buildLocation(key, params);
    navigate({ pathname, search }, { state });
  };

  return (
    <main className="min-h-screen bg-ground px-5 py-4 font-sans text-ink lg:px-10 lg:py-8">
      <Routes>
        <Route path="/disputes/chat" element={<DisputeChatPage />} />
        <Route path="/disputes" element={<DisputePage onNavigate={onNavigate} />}>
          <Route index element={<DisputeSearchPage />} />
          <Route path="references/:referenceId" element={<DisputeReferenceDetailPage />} />
        </Route>
      </Routes>
    </main>
  );
};

const Preview = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  if (!isLoggedIn) {
    return (
      <LoginScreen
        brand="Butler"
        subtitle="분쟁 해결사 미리보기"
        devHint="fixture 계정: landlord@butler.test / password123"
        onSubmit={async (credentials) => {
          await postLogin(credentials);
          setIsLoggedIn(true);
        }}
      />
    );
  }

  return (
    <MemoryRouter initialEntries={['/disputes']}>
      <Screens />
    </MemoryRouter>
  );
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Preview />
    </QueryClientProvider>
  </StrictMode>,
);

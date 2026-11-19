import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './index.css';

// 서버 데이터는 react-query로 불러온다(분쟁 해결사·AI 상담·커뮤니티 화면). 미리보기 DisputeChatPreview와 같은 기본값.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* v7 은 이동을 startTransition 으로 감싸 늦춘다. 로그아웃의 "먼저 /login 으로 이동, 그다음 세션 비우기" 순서(useLogout)가 깨지지 않게 끈다. */}
      <BrowserRouter useTransitions={false}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

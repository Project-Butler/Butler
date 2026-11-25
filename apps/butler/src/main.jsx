import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { axiosInstance } from '@butler/api-client';
import { App } from './App';
import { dropInactiveQueriesAfterWrite, queryClient } from './queryClient';
import './index.css';

dropInactiveQueriesAfterWrite(axiosInstance);

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

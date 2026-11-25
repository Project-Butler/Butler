// @testing-library/react 의 render 를 감싼다. 서버 데이터 훅(react-query)을 쓰는 화면이 테스트마다 Provider 를 두르지 않아도 되게,
// 렌더마다 새 QueryClient(재시도 없음·캐시 없음)로 감싼다. 직접 Provider 를 두른 테스트는 안쪽 것이 우선한다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender } from '../../../../node_modules/@testing-library/react/dist/index.js';

export * from '../../../../node_modules/@testing-library/react/dist/index.js';

export const render = (ui, options = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = options.wrapper;
  const wrapper = ({ children }) => (
    <QueryClientProvider client={client}>{Wrapper ? <Wrapper>{children}</Wrapper> : children}</QueryClientProvider>
  );
  return rtlRender(ui, { ...options, wrapper });
};

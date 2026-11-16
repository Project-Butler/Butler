import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildLocation } from '../../web/routes';

// 뒤로 가기: 이전 화면이 있으면 그리로, 주소로 바로 들어와 기록이 없으면(location.key 가 'default') fallback 화면으로 보낸다.
// 그러지 않으면 앱 밖으로 나가거나 아무 일도 없다. fallbackKey·fallbackParams 는 buildLocation 의 화면 key·값이다.
export const useGoBack = (fallbackKey, fallbackParams) => {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    () => (location.key === 'default' ? navigate(buildLocation(fallbackKey, fallbackParams), { replace: true }) : navigate(-1)),
    [location.key, navigate, fallbackKey, fallbackParams],
  );
};

// 화면 key 로 이동하는 함수(웹 화면의 onNavigate 와 같은 모양). options 는 navigate 옵션(replace 등).
export const useGoTo = () => {
  const navigate = useNavigate();
  return useCallback(
    (key, params, options) => {
      const { state, ...location } = buildLocation(key, params);
      navigate(location, { state, ...options });
    },
    [navigate],
  );
};

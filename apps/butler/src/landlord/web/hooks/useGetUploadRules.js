import { useEffect, useState } from 'react';
import { getUploadRules } from '@butler/api-client';
import { DEFAULT_UPLOAD_RULES } from '../utils/attachment';

// 업로드 규칙(GET /files/upload-rules)은 앱을 쓰는 동안 바뀌지 않으므로 한 번 받아 화면들이 함께 쓴다.
// 받기 전·받지 못했을 때(로그인 전, 오류)는 DEFAULT_UPLOAD_RULES(사진·PDF 20MB, 동영상 없음)를 돌려준다.
// react-query를 쓰지 않는 것은 이 hook을 쓰는 공용 업로드 컴포넌트가 QueryClientProvider 밖(테스트 등)에서도 그려지기 때문이다.
let cachedRules = null;
let pending = null;
const listeners = new Set();

const loadUploadRules = () => {
  if (cachedRules || pending) return;
  try {
    pending = Promise.resolve(getUploadRules())
      .then((rules) => {
        if (rules?.kinds && rules?.resourceKinds) cachedRules = rules;
      })
      .catch(() => {})
      .finally(() => {
        pending = null;
        for (const listener of listeners) listener();
      });
  } catch {
    pending = null;
  }
};

// 테스트에서 다음 화면이 새로 받게 비운다.
export const resetUploadRulesCache = () => {
  cachedRules = null;
  pending = null;
};

export const useGetUploadRules = () => {
  const [rules, setRules] = useState(() => cachedRules ?? DEFAULT_UPLOAD_RULES);

  useEffect(() => {
    if (cachedRules) {
      setRules(cachedRules);
      return undefined;
    }
    const listener = () => setRules(cachedRules ?? DEFAULT_UPLOAD_RULES);
    listeners.add(listener);
    loadUploadRules();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return rules;
};

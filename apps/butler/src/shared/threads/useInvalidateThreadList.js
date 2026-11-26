import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKey } from '@butler/api-client';

// 메시지를 보낸 뒤·읽은 뒤 대화 목록(안 읽은 수 포함)을 새로 받게 한다. 공용 대화 훅 안에서만 부른다.
export const useInvalidateThreadList = () => {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: [queryKey.THREADS] }), [queryClient]);
};

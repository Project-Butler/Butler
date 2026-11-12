import { useMutation } from '@tanstack/react-query';
import { postCommunityReport } from '@butler/api-client';

// 신고는 화면에 보이는 값을 바꾸지 않아서 다시 불러올 캐시가 없다.
export const usePostCommunityReport = () =>
  useMutation({
    mutationFn: postCommunityReport,
  });

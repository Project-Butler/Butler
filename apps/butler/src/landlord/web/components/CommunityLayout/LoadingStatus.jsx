import { PageSkeleton } from '@butler/ui';

// 상태 표시 — A팀 페이지와 같은 모양. 목록·상세 어디서든 쓰므로 글 줄 뼈대로 자리를 잡는다.
export const LoadingStatus = () => <PageSkeleton variant="list" rows={4} />;

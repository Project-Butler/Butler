import { ThreadListItem } from './ThreadListItem';

// 대화 목록. threads 는 sortThreadsForList 를 거친 것(useGetThreadList().items).
// 대화가 없으면 emptyText(화면마다 들어가는 길이 달라 문구를 받는다).
export const ThreadList = ({ threads, myUserId, onOpen, emptyText = '아직 대화가 없어요.', now }) => {
  if (threads.length === 0) return <p className="py-16 text-center text-body text-ink-2">{emptyText}</p>;
  return (
    <ul aria-label="대화 목록" className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {threads.map((thread) => (
        <ThreadListItem key={thread.id} thread={thread} myUserId={myUserId} onOpen={onOpen} now={now} />
      ))}
    </ul>
  );
};

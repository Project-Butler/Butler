import { NoticeBox } from '../../../shared/NoticeBox';
import { ThreadList } from '../../../shared/threads/ThreadList';
import { useGetThreadList } from '../../../shared/threads/useGetThreadList';
import { AppTabShell } from '../components/AppTabShell/AppTabShell';
import { useGoBack, useGoTo } from '../utils/navigation';

const EMPTY_TEXT = '아직 대화가 없어요.\n호실 상세나 수리 요청에서 임차인과 대화를 시작할 수 있어요.';

// 임대인 앱 대화 목록(시안 A1·A5). 위 막대 말풍선에서 들어온다. 하단 탭은 '내 자산'이 켜진다(tabs.js subPaths).
// 목록은 30초마다 새로 받고(창이 가려지면 건너뜀), 끝난 대화는 "지난 대화" 칩을 달고 맨 아래에 둔다.
export const ThreadListPage = ({ user, onUnauthorized }) => {
  const goBack = useGoBack('home');
  const goTo = useGoTo();
  const { items, error, isLoading } = useGetThreadList({ onUnauthorized });

  return (
    <AppTabShell backBar={{ title: '대화', onBack: goBack }}>
      {error && <NoticeBox>{error.message}</NoticeBox>}
      {isLoading ? (
        <p role="status" className="py-10 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      ) : (
        !error && (
          <ThreadList
            threads={items}
            myUserId={user?.id}
            emptyText={<span className="whitespace-pre-line">{EMPTY_TEXT}</span>}
            onOpen={(thread) => goTo('thread', { threadId: thread.id })}
          />
        )
      )}
    </AppTabShell>
  );
};

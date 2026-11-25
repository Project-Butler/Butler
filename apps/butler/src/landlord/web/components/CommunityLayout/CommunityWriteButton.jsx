import { Button } from '@butler/ui';
import { useCommunitySurface } from './CommunitySurface';

// 목록의 [글쓰기] · [투표 만들기]. 문구 · 누를 수 있는 조건(목록 meta canWrite) · 하는 일은 웹 · 앱 같고 자리만 다르다.
// 웹: 도구 줄 안의 보통 버튼(원래 그대로). 앱: 하단 탭 위 오른쪽에 떠 있는 버튼 — 화면을 내려도 그 자리.
//   하단 탭(약 66px) 위로 16px 띄우고, 모바일 폭(430px) 틀 안 오른쪽에 맞춘다. 목록 끝이 가리지 않게 CommunityFrame 이 아래를 비운다.
// icon: lucide 아이콘 · className: 웹 도구 줄 안 자리(ml-auto 등)
export const CommunityWriteButton = ({ icon: Icon, label, className = '', onClick, disabled }) => {
  const { isApp } = useCommunitySurface();
  if (!isApp) {
    return (
      <Button className={className} onClick={onClick} disabled={disabled}>
        <Icon size={16} className="-ml-0.5 mr-1.5 inline-block" aria-hidden="true" />
        {label}
      </Button>
    );
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[82px] z-20 mx-auto flex w-full max-w-[430px] justify-end px-5">
      <Button size="h48" className="pointer-events-auto inline-flex items-center !rounded-full" onClick={onClick} disabled={disabled}>
        <Icon size={18} className="-ml-0.5 mr-1.5" aria-hidden="true" />
        {label}
      </Button>
    </div>
  );
};

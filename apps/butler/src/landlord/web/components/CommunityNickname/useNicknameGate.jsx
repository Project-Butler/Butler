import { useCallback, useState } from 'react';
import { useGetCommunityProfile } from '../../hooks/useGetCommunityProfile';
import { toApiError } from '../../../../shared/apiError';
import { NicknameDialog } from './NicknameDialog';

// 닉네임 대화상자를 여는 곳을 한데 모은다(PC 명세 10절 "언제 뜨나").
//   (1) 머리의 "닉네임 정하기 / 닉네임 · …" — open()
//   (2) 닉네임 없이 [글쓰기] · [투표 만들기] · 댓글 [등록] — ensure(진행할 일, { afterSave })
//       닉네임이 없다고 확인됐으면 대화상자를 먼저 띄우고, 저장하면 afterSave(기본은 진행할 일)로 돌아간다.
//       아직 모르면(불러오는 중 · 실패) 그대로 진행한다 — 없으면 서버가 COMMUNITY_NICKNAME_REQUIRED 로 알려 준다
//   (3) 쓰기 요청이 COMMUNITY_NICKNAME_REQUIRED 로 막혔을 때 — handleWriteError(error) 가 true 를 돌려주면 대화상자가 열린 것
// CommunityPage 가 한 번 만들어 frame.nickname 으로 화면마다 넘기고, 대화상자(dialog)는 CommunityPage 가 그린다.
export const useNicknameGate = (complexId) => {
  const profile = useGetCommunityProfile({ complexId });
  const [request, setRequest] = useState(null); // { afterSave } — 열려 있으면 객체

  const open = useCallback((afterSave = null) => setRequest({ afterSave }), []);

  const hasNoNickname = profile.isSuccess && !profile.data.nickname;
  const ensure = useCallback(
    (proceed, { afterSave = proceed } = {}) => {
      if (hasNoNickname) setRequest({ afterSave });
      else proceed();
    },
    [hasNoNickname],
  );

  const handleWriteError = useCallback((error, afterSave = null) => {
    if (toApiError(error).code !== 'COMMUNITY_NICKNAME_REQUIRED') return false;
    setRequest({ afterSave });
    return true;
  }, []);

  const dialog = request && (
    <NicknameDialog
      complexId={complexId}
      profile={profile.data}
      onClose={() => setRequest(null)}
      onSaved={() => {
        setRequest(null);
        request.afterSave?.();
      }}
    />
  );

  return { nickname: profile.data?.nickname ?? null, open, ensure, handleWriteError, dialog };
};

// 임대인 앱 임차인 초대(M15, #169) 화면 값. 초대 상태 칩·버튼 이름은 웹(getInvitationChip)과 같게 쓴다.
import { getInvitationChip } from '../../web/utils/tenantInvite';

// 초대 화면의 계약 고르기에 넣을 계약 상태(진행·만료 임박·시작 전)
export const INVITABLE_CONTRACT_STATUSES = 'ACTIVE,EXPIRING_SOON,UPCOMING';

// 초대할 수 있는 계약: 수정할 수 있고(끝나지 않았고 소유 중) 아직 임차인 계정이 연결되지 않은 계약.
export const isInvitableContract = (contract) =>
  Boolean(contract) && !contract.isReadOnly && !contract.tenant?.userId && contract.tenant?.invitationStatus !== 'ACCEPTED';

// 계약 고르기 목록: 들어온 계약을 맨 앞에 두고, 같은 호실의 초대할 수 있는 계약을 시작일 순으로 잇는다(중복 없이).
export const toInviteContractOptions = (current, listed = []) => {
  const others = listed
    .filter((contract) => contract.id !== current?.id && isInvitableContract(contract))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return isInvitableContract(current) ? [current, ...others] : others;
};

// 계약 한 줄 이름(피그마 '○○아파트 101동 101호 · 2024-10-28~')
export const formatInviteContractLabel = (contract) => `${contract.property.displayName} · ${contract.startDate}~`;

const ACTION_LABEL = { reissue: '링크 다시 만들기', renew: '새 링크 만들기', invite: '임차인 초대' };

// 호실 상세·계약 관리의 초대 카드. 초대할 수 없는 계약이면 null(카드를 그리지 않는다).
// 초대 대기 칩의 만료일은 초대 목록을 읽어야 해서 앱 카드에는 적지 않는다.
export const getTenantInviteEntry = (contract) => {
  if (!isInvitableContract(contract)) return null;
  const chip = getInvitationChip(contract.tenant?.invitationStatus, null);
  return { chip: chip.label ? { tone: chip.tone, label: chip.label } : null, actionLabel: ACTION_LABEL[chip.action] ?? ACTION_LABEL.invite };
};

// 링크 보내기: 휴대폰 공유 창(문자·카카오톡)을 열고, 쓸 수 없으면 클립보드에 복사한다.
// 결과: 'shared' | 'canceled'(공유 창을 닫음) | 'copied' | 'failed'(둘 다 안 됨 — 화면이 링크를 보여 직접 복사하게 한다).
export const sendInviteLink = async ({ url, tenantName }, nav = globalThis.navigator) => {
  const text = `${tenantName ? `${tenantName}님, ` : ''}버틀러 임차인 초대 링크예요. 링크에서 본인 확인 후 계약을 확인해 주세요.`;
  if (typeof nav?.share === 'function') {
    try {
      await nav.share({ title: '버틀러 임차인 초대', text, url });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'canceled';
      // NotAllowedError(사용자 동작 뒤 시간이 지남) 등은 복사로 넘어간다.
    }
  }
  try {
    await nav.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
};

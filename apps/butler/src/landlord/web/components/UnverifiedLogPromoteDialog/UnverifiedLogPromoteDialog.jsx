import { useState } from 'react';
import { Button } from '@butler/ui';
import { BadgeCheck } from 'lucide-react';
import { Modal } from '../Modal/Modal';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { useGetUnverifiedLogPromotePreview } from '../../hooks/useGetUnverifiedLogPromotePreview';
import { usePostUnverifiedLogPromote } from '../../hooks/usePostUnverifiedLogPromote';
import { getLogTypeLabel } from '../../utils/managementLog';

// 팝업 목록에 보여 줄 기록 수(넘으면 "외 n건").
const MAX_VISIBLE_ITEMS = 5;
const ALREADY_PROMOTED = 'ALREADY_PROMOTED';
const TYPE_ORDER = ['REPAIR', 'INSPECTION', 'NOTE'];

// 유형별 건수 문구: "수리 1 · 점검 1 · 메모 1"
const toTypeSummary = (items) =>
  TYPE_ORDER.map((type) => [type, items.filter((item) => item.type === type).length])
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${getLogTypeLabel(type)} ${count}`)
    .join(' · ');

// 권리자 인증 뒤 한 번 묻기(H-44). ownershipId: 인증된 활성 소유 관계(아니면 undefined — 묻지 않음).
// 미리보기 count가 1건 이상일 때만 띄운다. [나만 보기로 두기] = { skip: true }, [호실 이력으로 남기기] = 올리기.
// 서버가 소유 관계당 한 번만 받으므로(이미 처리 = count 0, 409 ALREADY_PROMOTED) 고르면 다시 묻지 않는다.
// 닫기(×·Esc)는 이번 화면에서만 숨긴다(다음에 다시 물어본다). onDone({ promotedCount })은 고른 뒤 부른다.
export const UnverifiedLogPromoteDialog = ({ ownershipId, onDone, onUnauthorized }) => {
  const preview = useGetUnverifiedLogPromotePreview(ownershipId, { onUnauthorized });
  const promote = usePostUnverifiedLogPromote({ onUnauthorized });
  const [closedFor, setClosedFor] = useState(null);

  const count = preview.data?.count ?? 0;
  if (!ownershipId || count === 0 || closedFor === ownershipId) return null;

  const items = preview.data.items ?? [];
  const typeSummary = toTypeSummary(items);
  const close = () => {
    if (promote.isLoading) return;
    setClosedFor(ownershipId);
  };
  const choose = async (body) => {
    const { data, error } = await promote.promote(ownershipId, body);
    if (data || error?.code === ALREADY_PROMOTED) {
      setClosedFor(ownershipId);
      onDone?.({ promotedCount: data?.promotedCount ?? 0 });
    }
  };

  return (
    <Modal
      title="권리자 인증이 끝났어요"
      icon={BadgeCheck}
      iconTone="seal"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" size="h44" onClick={() => choose({ skip: true })} disabled={promote.isLoading}>
            나만 보기로 두기
          </Button>
          <Button size="h44" onClick={() => choose(undefined)} disabled={promote.isLoading}>
            {promote.isLoading ? '처리하는 중' : '호실 이력으로 남기기'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-body text-ink-2">
          인증 전에 남긴 하우스 로그 <b className="font-num tabular-nums text-ink">{count}</b>건{typeSummary && `(${typeSummary})`}을 <b>호실 이력</b>으로
          남길까요? 호실 이력은 이 집을 넘길 때 다음 임대인도 봐요.
        </p>
        <ul className="space-y-1 rounded-input bg-surface-2 p-3 text-sub text-ink-2">
          {items.slice(0, MAX_VISIBLE_ITEMS).map((item) => (
            <li key={item.id}>
              <span className="font-num tabular-nums">{item.occurredOn}</span> · {item.title} · {getLogTypeLabel(item.type)}
            </li>
          ))}
          {count > MAX_VISIBLE_ITEMS && <li className="text-ink-3">외 {count - Math.min(items.length, MAX_VISIBLE_ITEMS)}건</li>}
        </ul>
        <p className="text-sub text-ink-3">‘나만 보기’로 체크해 둔 메모는 빠져요. 나중에 기록마다 바꿀 수도 있어요.</p>
        {promote.error && promote.error.code !== ALREADY_PROMOTED && <NoticeBox>{promote.error.message}</NoticeBox>}
      </div>
    </Modal>
  );
};

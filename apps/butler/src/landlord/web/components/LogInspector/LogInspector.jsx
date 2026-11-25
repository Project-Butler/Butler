import { useState } from 'react';
import { Button, PageSkeleton } from '@butler/ui';
import { Building2, CalendarDays, ClipboardCheck, Coins, History, MapPin, Pencil, Search, StickyNote, Wrench, X } from 'lucide-react';
import { DocumentThumbnail } from '../DocumentThumbnail/DocumentThumbnail';
import { EmptyState } from '../EmptyState/EmptyState';
import { IconTile } from '../IconTile/IconTile';
import { ManagementLogBadges } from '../ManagementLogBadges/ManagementLogBadges';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { RoomChip } from '../RoomChip/RoomChip';
import { useDeleteManagementLog } from '../../hooks/useDeleteManagementLog';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import { useGetManagementLog } from '../../hooks/useGetManagementLog';
import { formatWon } from '../../utils/contract';

export const LOG_TYPE_ICON = { REPAIR: Wrench, INSPECTION: Search, NOTE: StickyNote, TICKET_SUMMARY: ClipboardCheck };

const InfoRow = ({ icon: Icon, label, children }) => (
  <div className="flex items-center gap-3 py-1.5 text-body">
    <Icon size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
    <span className="w-12 shrink-0 text-sub text-ink-3">{label}</span>
    <span className="min-w-0 flex-1 font-num tabular-nums text-ink">{children}</span>
  </div>
);

// 삭제: [삭제] → 안내 → [취소]·[삭제] 2단계(빨강 없음). 지울 수 있는지는 서버가 준 isDeletable(H-36·H-47).
// isHideOnly(매도 뒤 판 사람의 넘어간 기록)는 내 화면에서만 지운다(H-41).
const DeleteRow = ({ log, onDeleted, onUnauthorized }) => {
  const remove = useDeleteManagementLog({ onUnauthorized });
  const [isConfirming, setIsConfirming] = useState(false);

  const handleDelete = async () => {
    const { data } = await remove.mutate(log.id);
    if (data) onDeleted();
  };

  if (!isConfirming) {
    return (
      <button type="button" onClick={() => setIsConfirming(true)} className="text-sub font-medium text-ink-3 hover:text-ink">
        {log.isHideOnly ? '내 화면에서 삭제' : '기록 삭제'}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-input bg-surface-2 p-3">
      <p className="text-sub text-ink-2">
        {log.isHideOnly ? '내 화면에서만 지워요. 새 임대인에게는 그대로 보여요.' : '이 기록을 삭제할까요? 삭제하면 되돌릴 수 없어요.'}
      </p>
      {remove.error && <NoticeBox>{remove.error.message}</NoticeBox>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => setIsConfirming(false)} disabled={remove.isLoading}>
          취소
        </Button>
        <Button size="sm" onClick={handleDelete} disabled={remove.isLoading}>
          {remove.isLoading ? '삭제 중' : '삭제'}
        </Button>
      </div>
    </div>
  );
};

// 하우스 로그 오른쪽 기록 상세 패널(표 7 : 패널 3). 기록 상세 페이지를 대신한다.
// 수정은 isReadOnly가 아닐 때, 삭제는 isDeletable일 때.
export const LogInspector = ({ logId, onClose, onEdit, onDeleted, onNavigate, onUnauthorized }) => {
  const { data: log, error } = useGetManagementLog(logId, { onUnauthorized });
  // 사진·동영상·PDF는 새 탭 대신 미리보기 팝업으로 연다.
  const { openPreview, preview } = useDocumentPreview({ onUnauthorized });

  const frame = (children) => (
    <aside className="logs-page__inspector-panel sticky top-6 col-span-3 self-start overflow-hidden rounded-card border border-line bg-surface" aria-label="기록 상세">
      {children}
    </aside>
  );

  if (!logId) {
    return frame(<EmptyState icon={History} title="기록을 고르세요" description="표에서 기록을 누르면 내용·사진·비용을 여기서 봐요." />);
  }
  if (!log) {
    return frame(
      <div className="p-5">{error ? <NoticeBox>{error.message}</NoticeBox> : <PageSkeleton variant="text" rows={4} />}</div>,
    );
  }

  return frame(
    <>
      <div className="flex items-start gap-3 border-b border-line p-5">
        <IconTile icon={LOG_TYPE_ICON[log.type] ?? History} tone="accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sub text-ink-3">{log.property.displayName}</p>
          <h2 className="mt-0.5 break-keep text-section font-semibold text-ink">{log.title}</h2>
          <div className="mt-2">
            <ManagementLogBadges log={log} />
          </div>
        </div>
        <button
          type="button"
          aria-label="기록 상세 닫기"
          onClick={onClose}
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>
      <div className="px-5 pt-3">
        <InfoRow icon={CalendarDays} label="날짜">
          {log.occurredOn}
        </InfoRow>
        <InfoRow icon={MapPin} label="방">
          <RoomChip room={log.room} />
        </InfoRow>
        {log.cost != null && (
          <InfoRow icon={Coins} label="비용">
            {formatWon(log.cost)}
          </InfoRow>
        )}
      </div>
      <div className="px-5 pt-3">
        <p className="mb-2 text-label font-semibold text-ink">내용</p>
        <p className="whitespace-pre-wrap rounded-input bg-surface-2 p-3 text-body text-ink-2">{log.content || '내용이 없어요.'}</p>
      </div>
      <div className="px-5 py-4">
        <p className="mb-2 text-label font-semibold text-ink">
          사진 <span className="font-num font-normal tabular-nums text-ink-3">{log.attachments.length}</span>
        </p>
        {log.attachments.length > 0 ? (
          // 다운로드 URL은 패널을 열 때 문서마다 받는다(5분 유효). 사진을 누르면 미리보기 팝업으로 연다.
          <ul className="grid grid-cols-3 gap-2">
            {log.attachments.map((attachment) => (
              <li key={attachment.id}>
                <DocumentThumbnail document={attachment} onUnauthorized={onUnauthorized} onOpen={(document) => openPreview(document, log.attachments)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-3">사진이 없어요.</p>
        )}
      </div>
      {log.isReadOnly && (
        <p className="px-5 pb-4 text-sub text-ink-3">
          소유가 끝난 호실의 기록, 다른 소유자의 기록, 인증이 끊긴 호실의 호실 이력·자동 기록은 수정할 수 없어요.
        </p>
      )}
      <div className="space-y-3 border-t border-line px-5 py-4">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="h44" onClick={() => onNavigate('propertyDetail', { propertyId: log.propertyId })}>
            <Building2 size={15} className="-ml-0.5 mr-1.5 inline-block" />
            호실 보기
          </Button>
          {!log.isReadOnly && (
            <Button size="h44" onClick={() => onEdit(log.id)}>
              <Pencil size={15} className="-ml-0.5 mr-1.5 inline-block" />
              수정
            </Button>
          )}
        </div>
        {log.isDeletable && <DeleteRow key={log.id} log={log} onDeleted={onDeleted} onUnauthorized={onUnauthorized} />}
      </div>
      {preview}
    </>,
  );
};

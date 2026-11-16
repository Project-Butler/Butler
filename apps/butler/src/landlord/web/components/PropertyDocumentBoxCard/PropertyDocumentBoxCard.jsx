import { useState } from 'react';
import { Button } from '@butler/ui';
import { FileSignature, FolderOpen, ShieldCheck } from 'lucide-react';
import { useGetPropertyDocumentBox } from '../../hooks/useGetPropertyDocumentBox';
import { getUploadTargets, hasUploadTarget, splitContracts, summarizeDocuments } from '../../utils/documentBox';
import { DocumentUploadModal } from '../DocumentUploadModal/DocumentUploadModal';
import { NoticeBox } from '../NoticeBox/NoticeBox';

// 카드 안 한 칸: 제목 + 개수 + 최근 파일 2개(+ 외 n건). 파일 이름만 보이고 열기는 서류함 화면에서 한다.
const SummaryColumn = ({ icon: Icon, title, summary, hint }) => (
  <div className="min-w-0 rounded-input border border-line p-3">
    <p className="flex items-center gap-1.5 text-sub font-semibold text-ink">
      <Icon size={14} aria-hidden="true" />
      {title} <span className="font-num tabular-nums">{summary.count}</span>
      {hint && <span className="font-normal text-ink-3">· {hint}</span>}
    </p>
    {summary.count === 0 ? (
      <p className="mt-1.5 text-body text-ink-3">아직 올린 서류가 없어요</p>
    ) : (
      <ul className="mt-1.5 space-y-0.5">
        {summary.recent.map((doc) => (
          <li key={doc.id} className="truncate text-body text-ink-2" title={doc.fileName}>
            {doc.fileName}
          </li>
        ))}
        {summary.rest > 0 && (
          <li className="text-sub text-ink-3">
            외 <span className="font-num tabular-nums">{summary.rest}</span>건
          </li>
        )}
      </ul>
    )}
  </div>
);

// 호실 상세의 서류함 카드(관리 로그 아래). 제목 "서류함 n건" + [서류 올리기] + [서류함 열기], 내 소유 서류·계약 서류 두 칸.
// [서류 올리기]는 올릴 곳(isUploadable인 소유 관계 또는 계약)이 있을 때만 보인다. 끝난 소유 호실은 숨기고, 미인증이고 계약도 없으면 인증 안내 한 줄.
export const PropertyDocumentBoxCard = ({ propertyId, onNavigate, onUnauthorized }) => {
  const { data: box, error, isLoading, refetch } = useGetPropertyDocumentBox(propertyId, { onUnauthorized });
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const ownershipSummary = summarizeDocuments(box?.ownerships ?? []);
  const contractSummary = summarizeDocuments(box?.contracts ?? []);
  const hasCurrentContract = splitContracts(box?.contracts ?? []).current.length > 0;
  const canUpload = Boolean(box && hasUploadTarget(box));
  const needsVerification = Boolean(box && !canUpload && getUploadTargets(box).needsVerification);

  return (
    <section className="space-y-4 rounded-card border border-line bg-surface p-5" aria-labelledby="document-box-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="document-box-title" className="flex items-center gap-2 text-section font-semibold text-ink">
          <FolderOpen size={20} className="text-ink-3" aria-hidden="true" />
          서류함
          {box && <span className="font-num text-sub font-normal tabular-nums text-ink-3">{box.documentCount}건</span>}
        </h2>
        <span className="flex gap-2">
          {canUpload && (
            <Button variant="secondary" size="h44" onClick={() => setIsUploadOpen(true)}>
              서류 올리기
            </Button>
          )}
          <Button variant="secondary" size="h44" onClick={() => onNavigate('documents', { propertyId })}>
            서류함 열기
          </Button>
        </span>
      </div>
      {error && <NoticeBox>{error.message}</NoticeBox>}
      {isLoading && !box && <p className="text-body text-ink-3">불러오는 중입니다</p>}
      {needsVerification && <p className="text-sub text-ink-3">권리자 인증을 마치면 등기부·매매계약서를 올릴 수 있어요</p>}
      {box && (
        <div className="grid grid-cols-2 gap-3">
          <SummaryColumn icon={ShieldCheck} title="내 소유 서류" summary={ownershipSummary} />
          <SummaryColumn icon={FileSignature} title="계약 서류" summary={contractSummary} hint={hasCurrentContract ? '진행 중 계약 있음' : null} />
        </div>
      )}
      {isUploadOpen && box && (
        <DocumentUploadModal
          box={box}
          propertyName={box.property.displayName}
          onClose={() => setIsUploadOpen(false)}
          onUploaded={refetch}
          onUnauthorized={onUnauthorized}
        />
      )}
    </section>
  );
};

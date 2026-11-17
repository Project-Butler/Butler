import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '@butler/ui';
import { Building2, ChevronDown, ChevronRight, FileSignature, Lock, Plus, ShieldCheck, Upload } from 'lucide-react';
import { deleteDocument, postDocumentDownloadUrl } from '@butler/api-client';
import { DocumentBoxTable } from '../components/DocumentBoxTable/DocumentBoxTable';
import { DocumentUploadModal } from '../components/DocumentUploadModal/DocumentUploadModal';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { IconTile } from '../components/IconTile/IconTile';
import { Modal } from '../components/Modal/Modal';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetAllPropertyList } from '../hooks/useGetAllPropertyList';
import { useGetPropertyDocumentBox } from '../hooks/useGetPropertyDocumentBox';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';
import { useDocumentUrls } from '../../../shared/documentViewer/useDocumentUrls';
import { DocumentPreviewModal, isPreviewableDocument } from '../components/DocumentPreviewModal/DocumentPreviewModal';
import {
  describePropertyRow,
  formatContractPeriod,
  getContractGroupBadge,
  hasUploadTarget,
  splitContracts,
  splitPropertyName,
  splitOwnerships,
} from '../utils/documentBox';
import { formatDateKST } from '../utils/format';

const Count = ({ children }) => <span className="font-num tabular-nums">{children}</span>;

// 왼쪽 호실 줄: 동·호(자르지 않음) / 단지명 · "문서 n · 계약 중/공실" (미인증 호실은 인증 안내 문구)
const PropertyRow = ({ property, isFormer = false, isSelected, onSelect }) => {
  const { count, text } = describePropertyRow(property, { isFormer });
  const { unitLabel, complexName } = splitPropertyName(property);
  return (
    <button
      type="button"
      aria-current={isSelected ? 'true' : undefined}
      title={property.displayName}
      onClick={() => onSelect(property.id)}
      className={`flex w-full items-center gap-3 rounded-card border-2 bg-surface p-4 text-left transition-colors hover:bg-surface-2 ${
        isSelected ? 'border-accent' : 'border-line'
      }`}
    >
      <IconTile icon={Building2} tone={isSelected ? 'accent' : 'mute'} />
      <span className="min-w-0 flex-1">
        <span className="block whitespace-nowrap text-card font-semibold text-ink">{unitLabel}</span>
        {complexName && <span className="block truncate text-sub text-ink-2">{complexName}</span>}
        <span className="block text-sub text-ink-3">
          {count !== null && (
            <>
              문서 <Count>{count}</Count> ·{' '}
            </>
          )}
          {text}
        </span>
      </span>
      <ChevronRight size={18} className={isSelected ? 'text-accent' : 'text-ink-3'} aria-hidden="true" />
    </button>
  );
};

// 접고 펴는 묶음 머리(지난 계약·지난 소유 기간)
const CollapseHeader = ({ isOpen, onToggle, children }) => (
  <button
    type="button"
    aria-expanded={isOpen}
    onClick={onToggle}
    className="flex w-full items-center gap-2 border-t border-line px-5 py-3 text-left text-sub text-ink-2 transition-colors hover:bg-surface-2"
  >
    {isOpen ? <ChevronDown size={16} className="text-ink-3" aria-hidden="true" /> : <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />}
    {children}
  </button>
);

const UploadButton = ({ onClick }) => (
  <Button variant="secondary" size="sm" onClick={onClick}>
    <Plus size={14} className="-ml-0.5 mr-1 inline-block" aria-hidden="true" />
    올리기
  </Button>
);

const CardHeader = ({ icon, title, count, description, action }) => (
  <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
    <div className="flex min-w-0 items-center gap-2.5">
      <IconTile icon={icon} tone="accent" />
      <div className="min-w-0">
        <h2 className="text-card font-semibold text-ink">
          {title} <span className="font-num text-sub font-normal tabular-nums text-ink-3">{count}</span>
        </h2>
        <p className="text-sub text-ink-3">{description}</p>
      </div>
    </div>
    {action}
  </div>
);

// 내 소유 문서 카드. 올리기 조건·안내는 서버가 준 ownership.isUploadable·isActive를 그대로 따른다(D-A·D-C).
const OwnershipCard = ({ box, propertyId, userId, urlEntries, onOpen, onDelete, onUpload, onNavigate }) => {
  const { primary, past } = splitOwnerships(box.ownerships);
  const [isPastOpen, setIsPastOpen] = useState(false);
  if (!primary) return null;
  const pastDocumentCount = past.reduce((sum, ownership) => sum + ownership.documents.length, 0);
  const tableProps = { userId, urlEntries, onOpen, onDelete };

  return (
    <section className="rounded-card border border-line bg-surface">
      <CardHeader
        icon={ShieldCheck}
        title="내 소유 문서"
        count={primary.documents.length}
        description="등기부·매매계약서·보험처럼 호실 자체에 대한 문서"
        action={primary.isUploadable && onUpload ? <UploadButton onClick={() => onUpload({ target: 'OWNERSHIP' })} /> : null}
      />
      {primary.isActive && !primary.isUploadable && (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-5 py-3">
          <p className="text-sub text-ink-2">권리자 인증을 마치면 등기부·매매계약서를 올릴 수 있어요</p>
          <Button variant="verifyOutline" size="sm" onClick={() => onNavigate('propertyVerify', { propertyId, fromDetail: true })}>
            인증하기
          </Button>
        </div>
      )}
      {!primary.isActive && <p className="border-b border-line bg-surface-2 px-5 py-3 text-sub text-ink-2">끝난 소유 관계라 읽기·삭제만 할 수 있어요</p>}
      {primary.documents.length > 0 ? (
        <DocumentBoxTable documents={primary.documents} {...tableProps} showHead />
      ) : (
        <p className="px-5 py-6 text-body text-ink-3">아직 올린 내 소유 문서가 없어요</p>
      )}
      {past.length > 0 && (
        <>
          <CollapseHeader isOpen={isPastOpen} onToggle={() => setIsPastOpen((prev) => !prev)}>
            <span className="font-semibold">
              지난 소유 기간 <Count>{past.length}</Count>
            </span>
            <span className="text-ink-3">
              · 문서 <Count>{pastDocumentCount}</Count>
            </span>
          </CollapseHeader>
          {isPastOpen &&
            past.map((ownership) => (
              <div key={ownership.id} className="border-t border-line">
                <p className="bg-surface-2 px-5 py-2.5 text-sub text-ink-2">
                  <span className="font-num tabular-nums">
                    {formatDateKST(ownership.startedAt)} ~ {formatDateKST(ownership.endedAt)}
                  </span>
                  <span className="ml-2 text-ink-3">
                    문서 <Count>{ownership.documents.length}</Count>
                  </span>
                </p>
                {ownership.documents.length > 0 ? (
                  <DocumentBoxTable documents={ownership.documents} {...tableProps} />
                ) : (
                  <p className="px-5 py-4 text-body text-ink-3">올린 문서가 없어요</p>
                )}
              </div>
            ))}
        </>
      )}
    </section>
  );
};

// 계약 하나의 묶음: 머리(임차인 · 기간 · 상태 · 문서 수 · [올리기] · [계약 보기]) + 문서 표
const ContractGroup = ({ contract, userId, urlEntries, onOpen, onDelete, onUpload, onNavigate, showUpload }) => {
  const badge = getContractGroupBadge(contract);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-2.5 text-sub">
        <span className="font-semibold text-ink">{contract.tenantName}</span>
        <span className="font-num tabular-nums text-ink-2">{formatContractPeriod(contract.startDate, contract.endDate)}</span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <span className="text-ink-3">
          문서 <Count>{contract.documents.length}</Count>
        </span>
        <span className="ml-auto flex items-center gap-2">
          {showUpload && contract.isUploadable && onUpload && (
            <UploadButton onClick={() => onUpload({ target: 'CONTRACT', contractId: contract.id })} />
          )}
          <button type="button" onClick={() => onNavigate('contractDetail', { contractId: contract.id })} className="font-semibold text-accent hover:text-accent-strong">
            계약 보기
          </button>
        </span>
      </div>
      {contract.documents.length > 0 ? (
        <DocumentBoxTable documents={contract.documents} contract={contract} userId={userId} urlEntries={urlEntries} onOpen={onOpen} onDelete={onDelete} />
      ) : (
        <p className="px-5 py-4 text-body text-ink-3">이 계약에 올린 문서가 없어요</p>
      )}
    </div>
  );
};

// 계약 문서 카드. 진행 중 계약 먼저, 지난 계약은 접힘(지난 계약도 소유 관계가 활성이면 올리기, D-B)
const ContractCard = ({ box, propertyId, userId, urlEntries, onOpen, onDelete, onUpload, onNavigate }) => {
  const { current, past } = splitContracts(box.contracts);
  const [isPastOpen, setIsPastOpen] = useState(false);
  const total = box.contracts.reduce((sum, contract) => sum + contract.documents.length, 0);
  const canUploadAny = box.contracts.some((contract) => contract.isUploadable);
  const isOwnershipActive = box.ownerships.some((ownership) => ownership.isActive);
  const groupProps = { userId, urlEntries, onOpen, onDelete, onUpload, onNavigate };

  return (
    <section className="rounded-card border border-line bg-surface">
      <CardHeader
        icon={FileSignature}
        title="계약 문서"
        count={total}
        description="계약서·특약, 신고필증·확정일자, 영수증, 입주·퇴거 사진"
        action={canUploadAny && onUpload ? <UploadButton onClick={() => onUpload({ target: 'CONTRACT' })} /> : null}
      />
      {box.contracts.length === 0 && (
        <EmptyState
          icon={FileSignature}
          title="등록한 계약이 없어요"
          description="계약을 등록하면 계약서와 신고필증을 이곳에 모아 둘 수 있어요."
          action={
            isOwnershipActive ? (
              <Button variant="secondary" onClick={() => onNavigate('contractRegister', { propertyId })}>
                계약 등록
              </Button>
            ) : null
          }
        />
      )}
      {current.map((contract) => (
        <ContractGroup key={contract.id} contract={contract} {...groupProps} showUpload={false} />
      ))}
      {current.length === 0 && past.length > 0 && <p className="px-5 py-4 text-body text-ink-3">진행 중인 계약이 없어요</p>}
      {past.length > 0 && (
        <>
          <CollapseHeader isOpen={isPastOpen} onToggle={() => setIsPastOpen((prev) => !prev)}>
            <span className="font-semibold">
              지난 계약 <Count>{past.length}</Count>건
            </span>
          </CollapseHeader>
          {isPastOpen && past.map((contract) => <ContractGroup key={contract.id} contract={contract} {...groupProps} showUpload />)}
        </>
      )}
    </section>
  );
};

// 지울 문서 확인 팝업. 서버가 거절하면(422·403) 그 message를 그대로 보여 준다(design.md 7-2).
const DeleteDocumentModal = ({ doc, onClose, onDeleted, onUnauthorized }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteDocument(doc.id);
      onDeleted();
    } catch (caught) {
      if (isUnauthorizedError(caught)) {
        onUnauthorized?.();
        return;
      }
      setError(toApiError(caught));
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      title="문서를 삭제할까요?"
      onClose={isDeleting ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
            취소
          </Button>
          <Button onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? '삭제 중' : '삭제하기'}
          </Button>
        </>
      }
    >
      {/* 되돌릴 수 없는 행동이라 파일 이름을 굵게, 경고 줄을 Crit 글자로 둔다(버튼 색은 design.md 버튼 표 그대로). */}
      <p className="break-all text-body font-semibold text-ink">{doc.fileName}</p>
      <p className="mt-1 text-body text-crit-ink">삭제하면 되돌릴 수 없어요.</p>
      {error && <NoticeBox className="mt-4">{error.message}</NoticeBox>}
    </Modal>
  );
};

// 임대인 문서함(/landlord/documents). 왼쪽 호실 목록 3 : 오른쪽 선택한 호실의 문서 7.
// propertyId(주소의 ?propertyId)가 없거나 내 호실이 아니면 첫 호실을 골라 주소를 바꾼다. 예전 호실(FORMER_OWNER)도 같은 화면에서 연다.
// 열기: PDF·사진은 미리보기 팝업(DocumentPreviewModal), 그 밖은 useDocumentUrls의 open(새 탭).
// 어느 쪽이든 누를 때마다 새 주소를 받아 감사 줄이 사람이 연 횟수만큼 남는다. 화면을 열 때 썸네일 주소는 받지 않는다.
export const DocumentBoxPage = ({ propertyId, userId, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const ownerQuery = useGetAllPropertyList('OWNER', hookOptions);
  const formerQuery = useGetAllPropertyList('FORMER_OWNER', hookOptions);
  const owners = ownerQuery.data;
  const formers = formerQuery.data;
  const isListReady = Boolean(owners && (formers || formerQuery.error));
  const selected = [...(owners ?? []), ...(formers ?? [])].find((property) => property.id === propertyId) ?? null;
  const fallback = owners?.[0] ?? formers?.[0] ?? null;
  const isSelectedFormer = Boolean(selected && formers?.some((property) => property.id === selected.id));

  const boxQuery = useGetPropertyDocumentBox(selected?.id, hookOptions);
  const { refetch: refetchBox } = boxQuery;
  const { refetch: refetchOwners } = ownerQuery;
  const { refetch: refetchFormers } = formerQuery;
  const urls = useDocumentUrls(postDocumentDownloadUrl);
  const [previewing, setPreviewing] = useState(null);

  const [notice, setNotice] = useState(null);
  const [isFormerOpen, setIsFormerOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  // 문서 올리기 팝업: null이면 닫힘, 아니면 칸의 [올리기]가 미리 고른 값({ target?, contractId? })
  const [uploadRequest, setUploadRequest] = useState(null);

  // 주소의 호실이 없거나 내 호실이 아니면 첫 호실로 바꾼다. 주소에 호실이 있었는데 내 호실이 아니면 안내를 남긴다.
  useEffect(() => {
    if (!isListReady || !fallback || selected) return;
    if (propertyId) setNotice('찾을 수 없는 호실이라 첫 호실을 열었어요.');
    onNavigate('documents', { propertyId: fallback.id }, { replace: true });
  }, [isListReady, fallback, selected, propertyId, onNavigate]);

  const reloadAll = useCallback(() => {
    refetchBox();
    refetchOwners();
    refetchFormers();
  }, [refetchBox, refetchOwners, refetchFormers]);

  const handleSelect = (nextId) => {
    setNotice(null);
    onNavigate('documents', { propertyId: nextId });
  };

  const handleUploaded = (count) => {
    setNotice(`문서 ${count}개를 올렸어요.`);
    reloadAll();
  };

  const handleDeleted = () => {
    setDeleting(null);
    reloadAll();
  };

  if (!isListReady) {
    const error = ownerQuery.error ?? formerQuery.error;
    return (
      <div className="w-full space-y-6">
        <PageHeader title="문서함" />
        {error ? <NoticeBox>{error.message}</NoticeBox> : <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>}
      </div>
    );
  }

  if (!fallback) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="문서함" />
        <EmptyState
          icon={Building2}
          title="등록한 부동산이 없어요"
          description="부동산을 등록하면 호실마다 문서를 보관할 수 있어요."
          action={<Button onClick={() => onNavigate('propertyRegister')}>부동산 등록</Button>}
        />
      </div>
    );
  }

  const box = boxQuery.data;
  const isFormerShown = isFormerOpen || isSelectedFormer;
  const cardProps = {
    box,
    propertyId: selected?.id,
    userId,
    urlEntries: urls.entries,
    onOpen: (document) => (isPreviewableDocument(document) ? setPreviewing(document) : urls.open(document)),
    onDelete: setDeleting,
    onUpload: setUploadRequest,
    onNavigate,
  };

  return (
    <div className="w-full space-y-5 pb-10">
      <PageHeader
        title="문서함"
        description="호실마다 내 소유 문서와 계약 문서를 보관해요. 계약이 끝나도 문서는 남아요."
        actions={
          box &&
          hasUploadTarget(box) && (
            <Button size="h44" onClick={() => setUploadRequest({})}>
              <Upload size={16} className="-ml-0.5 mr-1.5 inline-block" aria-hidden="true" />
              문서 업로드
            </Button>
          )
        }
      />
      {notice && <NoticeBox tone="info">{notice}</NoticeBox>}
      {ownerQuery.error && <NoticeBox>{ownerQuery.error.message}</NoticeBox>}
      {formerQuery.error && <NoticeBox>{formerQuery.error.message}</NoticeBox>}

      <div className="grid grid-cols-10 items-start gap-5">
        <nav className="col-span-3 space-y-2" aria-label="호실">
          {owners.map((property) => (
            <PropertyRow key={property.id} property={property} isSelected={property.id === selected?.id} onSelect={handleSelect} />
          ))}
          {formers && formers.length > 0 && (
            <div className="space-y-2 pt-2">
              <button
                type="button"
                aria-expanded={isFormerShown}
                // 예전 호실을 고른 동안에는 접지 않는다(고른 줄이 사라지지 않게).
                disabled={isSelectedFormer}
                onClick={() => setIsFormerOpen((prev) => !prev)}
                className="flex min-h-11 w-full items-center gap-2 rounded-input px-2 text-left text-body font-semibold text-ink-2 transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
              >
                {isFormerShown ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                <span>
                  예전 호실 <Count>{formers.length}</Count>
                </span>
              </button>
              {isFormerShown &&
                formers.map((property) => (
                  <PropertyRow key={property.id} property={property} isFormer isSelected={property.id === selected?.id} onSelect={handleSelect} />
                ))}
            </div>
          )}
          <div className="flex items-start gap-2 rounded-input bg-surface-2 p-3 text-sub text-ink-3">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>문서는 나만 봐요. 초대에서 고른 계약 문서만 임차인이 봐요. 호실을 팔아도 다음 소유자에게 넘어가지 않고, 열 때마다 기록이 남아요.</span>
          </div>
        </nav>

        <div className="col-span-7 space-y-5">
          {boxQuery.error && <NoticeBox>{boxQuery.error.message}</NoticeBox>}
          {boxQuery.isLoading && !box && <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>}
          {box && selected && (
            <>
              <OwnershipCard key={`ownership-${selected.id}`} {...cardProps} />
              <ContractCard key={`contract-${selected.id}`} {...cardProps} />
              <p className="text-sub text-ink-3">관리 로그·유지보수 요청에 붙인 사진은 각 기록에서 봐요.</p>
            </>
          )}
        </div>
      </div>

      {uploadRequest && box && (
        <DocumentUploadModal
          box={box}
          propertyName={box.property.displayName}
          initialTarget={uploadRequest.target}
          initialContractId={uploadRequest.contractId}
          onClose={() => setUploadRequest(null)}
          onUploaded={handleUploaded}
          onUnauthorized={onUnauthorized}
        />
      )}
      {previewing && <DocumentPreviewModal document={previewing} urls={urls} onClose={() => setPreviewing(null)} />}
      {deleting && <DeleteDocumentModal doc={deleting} onClose={() => setDeleting(null)} onDeleted={handleDeleted} onUnauthorized={onUnauthorized} />}
    </div>
  );
};

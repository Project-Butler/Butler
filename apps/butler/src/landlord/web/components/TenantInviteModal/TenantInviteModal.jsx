import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@butler/ui';
import { Check, CheckCircle2, Copy, Files, FileText, ImagePlus, Info, Send, Upload } from 'lucide-react';
import { postDocumentDownloadUrl } from '@butler/api-client';
import { Modal } from '../Modal/Modal';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { SharedDocumentPreview } from './SharedDocumentPreview';
import { useContractDocumentUploads } from '../../hooks/useContractDocumentUploads';
import { useGetContractDocumentList } from '../../hooks/useGetContractDocumentList';
import { usePostTenantInvitation } from '../../hooks/usePostTenantInvitation';
import { isUnauthorizedError } from '../../../../shared/apiError';
import { formatPeriod } from '../../utils/contract';
import {
  CONTRACT_FILE_ACCEPT,
  CONTRACT_PHOTO_ACCEPT,
  formatDotDate,
  isContractPhoto,
  maskPhone,
  MAX_SHARED_DOCUMENTS,
  selectUploadedDocument,
  toggleSharedDocument,
  toPreviewDocuments,
} from '../../utils/tenantInvite';

// 링크 유효 기간(서버 INVITATION_TTL과 같다). 날짜는 응답의 expiresAt으로 적는다.
const INVITE_VALID_DAYS = 7;

// 사진 썸네일 주소(5분 유효). 방금 올린 사진은 내 컴퓨터 주소(localUrls)를 쓰고, 나머지만 서버에서 받는다.
const useDocumentImageUrls = (documents, localUrls, onUnauthorized) => {
  const [fetched, setFetched] = useState({});
  const requested = useRef(new Set());

  useEffect(() => {
    for (const document of documents) {
      if (!isContractPhoto(document.mimeType) || localUrls[document.id] || requested.current.has(document.id)) continue;
      requested.current.add(document.id);
      postDocumentDownloadUrl(document.id)
        .then((issued) => setFetched((prev) => ({ ...prev, [document.id]: issued.url })))
        .catch((error) => {
          if (isUnauthorizedError(error)) onUnauthorized?.();
        });
    }
  }, [documents, localUrls, onUnauthorized]);

  return { ...fetched, ...localUrls };
};

const Checkbox = ({ checked }) => (
  <span
    aria-hidden="true"
    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${checked ? 'bg-accent text-white' : 'border border-line bg-surface'}`}
  >
    {checked && <Check size={13} strokeWidth={2.5} />}
  </span>
);

// A2c: 11번째를 고르거나 올리는 순간 뜬다. 한도 숫자는 이 팝업에만 적는다(결정 13).
const LimitDialog = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 p-6">
      <div role="alertdialog" aria-modal="true" aria-labelledby="invite-limit-title" aria-describedby="invite-limit-body" className="w-full max-w-sm rounded-card border border-line bg-surface p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-warn-soft text-warn-ink" aria-hidden="true">
          <Files size={22} strokeWidth={1.8} />
        </span>
        <h3 id="invite-limit-title" className="mt-3 text-card font-semibold text-ink">
          계약서는 {MAX_SHARED_DOCUMENTS}개까지 공유할 수 있어요
        </h3>
        <p id="invite-limit-body" className="mt-1 text-body text-ink-2">
          고른 파일 중 {MAX_SHARED_DOCUMENTS}개만 남기고 다시 시도해 주세요.
        </p>
        <div className="mt-5 flex justify-end">
          <Button autoFocus size="h44" onClick={onClose}>
            확인
          </Button>
        </div>
      </div>
    </div>
  );
};

// A1 등록 완료 + 초대 시작
const IntroStep = ({ contract }) => (
  <div className="space-y-4">
    <p className="text-body text-ink-2">
      {contract.tenantName} 님에게 초대 링크를 보내면, 임차인이 계약서를 확인하고 앱에서 수리 요청을 보낼 수 있어요.
    </p>
    <dl className="divide-y divide-line rounded-input bg-surface-2 px-4">
      <div className="flex gap-4 py-2.5">
        <dt className="w-16 shrink-0 text-body text-ink-3">호실</dt>
        <dd className="min-w-0 flex-1 text-body text-ink">{contract.property?.displayName ?? '—'}</dd>
      </div>
      <div className="flex gap-4 py-2.5">
        <dt className="w-16 shrink-0 text-body text-ink-3">기간</dt>
        <dd className="min-w-0 flex-1 font-num text-body tabular-nums text-ink">{formatPeriod(contract)}</dd>
      </div>
      <div className="flex gap-4 py-2.5">
        <dt className="w-16 shrink-0 text-body text-ink-3">임차인</dt>
        <dd className="min-w-0 flex-1 text-body text-ink">
          {contract.tenantName}
          {contract.tenant?.phone && <span className="font-num tabular-nums"> · {maskPhone(contract.tenant.phone)}</span>}
        </dd>
      </div>
    </dl>
  </div>
);

// A2 함께 보여 줄 계약서: PDF는 한 줄씩, 사진은 격자(묶지 않음). 새로 올리면 바로 선택.
const DocumentsStep = ({ documentList, uploads, documents, selectedIds, imageUrls, onToggle, onPreview, submitError }) => {
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const files = documents.filter((document) => !isContractPhoto(document.mimeType));
  const photos = documents.filter((document) => isContractPhoto(document.mimeType));
  const selectedPhotoCount = photos.filter((photo) => selectedIds.includes(photo.id)).length;
  const uploadingPhotos = uploads.items.filter((item) => isContractPhoto(item.mimeType));
  const uploadingFiles = uploads.items.filter((item) => !isContractPhoto(item.mimeType));

  const handleFiles = (event) => {
    if (event.target.files?.length) uploads.addFiles(event.target.files);
    event.target.value = '';
  };

  return (
    <div className="space-y-3">
      <p className="text-body text-ink-2">임차인이 링크를 열면 이 계약서를 먼저 봐요.</p>
      {documentList.error && <NoticeBox>{documentList.error.message}</NoticeBox>}
      {documentList.isLoading && !documentList.data && <p className="text-body text-ink-3">불러오는 중입니다</p>}

      <ul className="space-y-2" aria-label="계약서 파일">
        {files.map((document) => {
          const checked = selectedIds.includes(document.id);
          return (
            <li key={document.id}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-input p-3 transition-colors ${
                  checked ? 'border-2 border-accent' : 'border border-line hover:bg-surface-2'
                }`}
              >
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => onToggle(document.id)} />
                <Checkbox checked={checked} />
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-crit-soft text-crit-ink" aria-hidden="true">
                  <FileText size={17} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-ink">{document.fileName}</span>
                  <span className="block text-sub text-ink-3">서류함 · 계약 서류</span>
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    onPreview(document.id);
                  }}
                  className="shrink-0 text-sub font-semibold text-accent hover:text-accent-strong"
                >
                  크게 보기
                </button>
              </label>
            </li>
          );
        })}
        {uploadingFiles.map((item) => (
          <li key={item.key} className="flex items-center gap-3 rounded-input border border-dashed border-line p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-surface-2 text-ink-3" aria-hidden="true">
              <FileText size={17} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body text-ink-2">{item.fileName}</span>
              {item.status === 'error' ? (
                <span className="block text-sub text-crit-ink">{item.error}</span>
              ) : (
                <span className="block font-num text-sub tabular-nums text-ink-3">올리는 중 {Math.round(item.progress * 100)}%</span>
              )}
            </span>
            {item.status === 'error' && (
              <button type="button" onClick={() => uploads.dismiss(item.key)} className="shrink-0 text-sub font-medium text-ink-3 hover:text-ink">
                지우기
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="rounded-input border border-line p-3">
        <div className="flex items-center justify-between">
          <p className="text-body font-semibold text-ink">
            사진{' '}
            {selectedPhotoCount > 0 && <span className="font-num text-sub font-normal tabular-nums text-ink-3">{selectedPhotoCount}장 선택</span>}
          </p>
          {photos.length > 0 && (
            <button type="button" onClick={() => onPreview(photos[0].id)} className="text-sub font-semibold text-accent hover:text-accent-strong">
              크게 보기
            </button>
          )}
        </div>
        <ul className="mt-2 grid grid-cols-4 gap-2" aria-label="계약서 사진">
          {photos.map((photo) => {
            const checked = selectedIds.includes(photo.id);
            const url = imageUrls[photo.id];
            return (
              <li key={photo.id} className="min-w-0 space-y-1">
                <label
                  className={`relative block h-20 cursor-pointer overflow-hidden rounded-input bg-surface-2 ${
                    checked ? 'border-2 border-accent' : 'border border-line hover:opacity-90'
                  }`}
                  title={photo.fileName}
                >
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => onToggle(photo.id)} aria-label={photo.fileName} />
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-chip text-ink-3">불러오는 중</span>
                  )}
                  <span className="absolute left-1 top-1">
                    <Checkbox checked={checked} />
                  </span>
                </label>
                <span className="block truncate text-center font-num text-chip text-ink-3">{photo.fileName}</span>
              </li>
            );
          })}
          {uploadingPhotos.map((item) => (
            <li key={item.key} className="min-w-0 space-y-1">
              <span className="flex h-20 flex-col items-center justify-center rounded-input border border-dashed border-line bg-surface-2 px-1 text-center text-chip">
                {item.status === 'error' ? (
                  <button type="button" onClick={() => uploads.dismiss(item.key)} className="text-crit-ink" title={item.error}>
                    못 올렸어요 · 지우기
                  </button>
                ) : (
                  <span className="font-num tabular-nums text-ink-3">{Math.round(item.progress * 100)}%</span>
                )}
              </span>
              <span className="block truncate text-center font-num text-chip text-ink-3">{item.fileName}</span>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-input border border-dashed border-dash text-chip text-ink-3 transition-colors hover:border-accent hover:text-accent"
            >
              <ImagePlus size={18} aria-hidden="true" />
              사진 추가
            </button>
          </li>
        </ul>
        {uploadingPhotos.some((item) => item.status === 'error') && (
          <p className="mt-2 text-sub text-crit-ink">{uploadingPhotos.find((item) => item.status === 'error').error}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-0.5 rounded-input border border-dashed border-dash py-2.5 text-sub text-ink-3 transition-colors hover:border-accent hover:text-accent"
      >
        <span className="flex items-center gap-2 font-medium">
          <Upload size={16} aria-hidden="true" />
          계약서 새로 올리기
        </span>
        <span className="text-chip">PDF 또는 사진(JPG·PNG) · 사진은 여러 장 한 번에 올릴 수 있어요</span>
      </button>
      <input ref={photoInputRef} type="file" accept={CONTRACT_PHOTO_ACCEPT} multiple className="hidden" onChange={handleFiles} aria-hidden="true" tabIndex={-1} />
      <input ref={fileInputRef} type="file" accept={CONTRACT_FILE_ACCEPT} multiple className="hidden" onChange={handleFiles} aria-hidden="true" tabIndex={-1} />

      {uploads.notice && <NoticeBox tone="warn">{uploads.notice}</NoticeBox>}
      <p className="flex items-start gap-1.5 text-sub text-ink-3">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        계약서가 없어도 초대할 수 있어요. 사진은 [크게 보기]로 글자가 잘 보이는지 확인하세요.
      </p>
      {submitError && <NoticeBox>{submitError.message}</NoticeBox>}
    </div>
  );
};

// A3 링크 복사. 링크는 이 창에서만 보인다(다시 받을 수 없다).
const LinkStep = ({ invitation, tenantName }) => {
  const inputRef = useRef(null);
  const [copyState, setCopyState] = useState(null); // null | 'done' | 'failed'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invitation.inviteUrl);
      setCopyState('done');
    } catch {
      inputRef.current?.select();
      setCopyState('failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-input border border-line bg-surface-2 p-1.5 pl-3">
        <input
          ref={inputRef}
          readOnly
          value={invitation.inviteUrl}
          aria-label="초대 링크"
          onFocus={(event) => event.target.select()}
          className="h-11 min-w-0 flex-1 truncate bg-transparent font-num text-body text-ink-2 outline-none"
        />
        <Button size="h44" onClick={handleCopy} className="inline-flex shrink-0 items-center gap-1.5">
          <Copy size={16} aria-hidden="true" />
          링크 복사
        </Button>
      </div>
      <div aria-live="polite">
        {copyState === 'done' && (
          <p className="flex items-center gap-1.5 text-sub font-semibold text-ok-ink">
            <CheckCircle2 size={16} aria-hidden="true" />
            복사했어요. 문자나 카카오톡에 붙여 넣어 {tenantName} 님에게 보내세요.
          </p>
        )}
        {copyState === 'failed' && <p className="text-sub text-warn-ink">자동으로 복사하지 못했어요. 링크를 선택해 두었으니 직접 복사해 주세요.</p>}
      </div>
      <div className="rounded-input bg-surface-2 p-4 text-sub text-ink-2">
        <p className="font-semibold text-ink">보내기 전에 확인해 주세요</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>
            링크는 <b className="font-num">{INVITE_VALID_DAYS}일</b> 동안 쓸 수 있어요
            {invitation.expiresAt && <span className="font-num tabular-nums">({formatDotDate(invitation.expiresAt)}까지)</span>}.
          </li>
          <li>이 창을 닫으면 링크를 다시 볼 수 없어요. 잃어버리면 새로 만들면 돼요(이전 링크는 못 쓰게 돼요).</li>
          <li>임차인은 휴대폰 번호 뒤 4자리로 본인 확인을 한 뒤 계약서를 봐요.</li>
        </ul>
      </div>
    </div>
  );
};

// 임차인 초대 팝업(A1 → A2 → A2b·A2c → A3). 계약 등록 직후에는 A1(startStep 'intro')부터,
// 호실 상세 계약 영역의 [임차인 초대]·[링크 다시 만들기]·[새 링크 만들기]는 A2('documents')부터 연다.
// 링크를 만들면 onInvited(invitation)로 알려 계약 영역의 초대 상태를 새로 고친다.
export const TenantInviteModal = ({ contract, startStep = 'documents', onClose, onInvited, onUnauthorized }) => {
  const [step, setStep] = useState(startStep);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isLimitOpen, setIsLimitOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const invite = usePostTenantInvitation({ onUnauthorized });
  const isDocumentsStep = step === 'documents';
  const documentList = useGetContractDocumentList(contract.id, { onUnauthorized });

  const handleUploaded = useCallback((document) => {
    setSelectedIds((prev) => {
      const next = selectUploadedDocument(prev, document.id);
      if (next.exceeded) setIsLimitOpen(true);
      return next.selectedIds;
    });
  }, []);
  const uploads = useContractDocumentUploads(contract.id, { onUploaded: handleUploaded, onUnauthorized });

  // 서류함 목록 + 이번에 올린 파일(목록을 다시 부르지 않고 합친다). PDF 줄이 먼저, 사진 격자가 다음.
  const loaded = documentList.data ?? [];
  const merged = [...loaded, ...uploads.uploaded.filter((document) => !loaded.some((item) => item.id === document.id))];
  const documents = [...merged.filter((document) => !isContractPhoto(document.mimeType)), ...merged.filter((document) => isContractPhoto(document.mimeType))];
  const imageUrls = useDocumentImageUrls(documents, uploads.previewUrls, onUnauthorized);
  const previewDocuments = toPreviewDocuments(documents, selectedIds);

  const handleToggle = (documentId) => {
    const next = toggleSharedDocument(selectedIds, documentId);
    if (next.exceeded) setIsLimitOpen(true);
    setSelectedIds(next.selectedIds);
  };

  const handlePreview = (documentId) => {
    const position = previewDocuments.findIndex((document) => document.id === documentId);
    setPreviewIndex(position >= 0 ? position : 0);
  };

  const handleCreate = async () => {
    const { data, error } = await invite.createInvitation(contract.id, { sharedDocumentIds: selectedIds });
    if (data) {
      setStep('link');
      onInvited?.(data);
      return;
    }
    // 화면에서 미리 막지만, 다른 창에서 고른 경우 등 서버가 한도로 거절하면 같은 팝업을 띄운다.
    if (error?.code === 'ATTACHMENT_LIMIT_EXCEEDED') {
      invite.reset();
      setIsLimitOpen(true);
    }
  };

  const isBusy = invite.isLoading || uploads.isUploading;

  const footer =
    step === 'intro' ? (
      <>
        <Button variant="secondary" size="h48" onClick={onClose}>
          나중에 하기
        </Button>
        <Button size="h48" onClick={() => setStep('documents')} className="inline-flex items-center gap-1.5">
          <Send size={16} aria-hidden="true" />
          임차인 초대하기
        </Button>
      </>
    ) : isDocumentsStep ? (
      <>
        <Button variant="secondary" size="h48" onClick={startStep === 'intro' ? () => setStep('intro') : onClose} disabled={invite.isLoading}>
          {startStep === 'intro' ? '이전' : '취소'}
        </Button>
        <Button size="h48" onClick={handleCreate} disabled={isBusy}>
          {invite.isLoading ? '만드는 중' : uploads.isUploading ? '올리는 중' : '링크 만들기'}
        </Button>
      </>
    ) : (
      <Button variant="secondary" size="h48" onClick={onClose}>
        닫기
      </Button>
    );

  const header =
    step === 'intro'
      ? { title: '계약을 등록했어요', icon: Check, iconTone: 'ok' }
      : { title: '임차인 초대', subtitle: isDocumentsStep ? '1/2 · 함께 보여 줄 계약서' : '2/2 · 링크를 보내 주세요' };

  return (
    <>
      <Modal {...header} onClose={onClose} footer={footer}>
        {step === 'intro' && <IntroStep contract={contract} />}
        {isDocumentsStep && (
          <DocumentsStep
            documentList={documentList}
            uploads={uploads}
            documents={documents}
            selectedIds={selectedIds}
            imageUrls={imageUrls}
            onToggle={handleToggle}
            onPreview={handlePreview}
            submitError={invite.error}
          />
        )}
        {step === 'link' && invite.data && <LinkStep invitation={invite.data} tenantName={contract.tenantName} />}
      </Modal>
      {previewIndex !== null && previewDocuments.length > 0 && (
        <SharedDocumentPreview
          documents={previewDocuments}
          initialIndex={previewIndex}
          imageUrls={imageUrls}
          onClose={() => setPreviewIndex(null)}
          onUnauthorized={onUnauthorized}
        />
      )}
      {isLimitOpen && <LimitDialog onClose={() => setIsLimitOpen(false)} />}
    </>
  );
};

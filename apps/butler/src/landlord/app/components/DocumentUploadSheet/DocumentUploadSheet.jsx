import { useState } from 'react';
import { Badge, Button, FilterChip } from '@butler/ui';
import { FileText, Image, Upload, X } from 'lucide-react';
import { NoticeBox } from '../../../web/components/NoticeBox/NoticeBox';
import { useDocumentBoxUploads } from '../../../web/hooks/useDocumentBoxUploads';
import { ATTACHMENT_ACCEPT, formatFileSize } from '../../../web/utils/attachment';
import {
  CONTRACT_TARGET,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES_BY_TARGET,
  formatContractOption,
  getRemainingSlots,
  getSelectableFileCount,
  getUploadTargets,
  MAX_FILE_SIZE_TEXT,
  MAX_FILES_PER_BATCH,
  OWNERSHIP_TARGET,
  pickDefaultContract,
  TARGET_LABELS,
} from '../../../web/utils/documentBox';
import { BottomSheet } from '../BottomSheet/BottomSheet';

const SECTION_LABEL = 'text-m-label font-semibold text-ink';

// 고른 파일 한 줄: 형식 아이콘 · 이름 · 크기 · 상태(대기 · 올리는 중 n% · 오류) · 빼기
const FileRow = ({ item, isSaving, onRemove }) => {
  const isUploading = item.status === 'uploading';
  const percent = Math.round(item.progress * 100);
  const Icon = item.mimeType?.startsWith('image/') ? Image : FileText;
  return (
    <li className="rounded-input border border-line p-2.5">
      <div className="flex items-center gap-2.5">
        <Icon size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-ink">{item.fileName}</span>
          <span className="font-num text-num-sub tabular-nums text-ink-3">{formatFileSize(item.sizeBytes)}</span>
        </span>
        {item.status === 'pending' && <Badge mobile>대기</Badge>}
        {isUploading && (
          <Badge mobile tone="warning">
            <span className="font-num tabular-nums">{percent}%</span>
          </Badge>
        )}
        {item.status === 'error' && (
          <Badge mobile tone="danger">
            올리지 못함
          </Badge>
        )}
        <button
          type="button"
          aria-label={`${item.fileName} 빼기`}
          disabled={isUploading || isSaving}
          onClick={() => onRemove(item.key)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-ink-3 disabled:opacity-40"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {isUploading && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
      {item.status === 'error' && item.error && <p className="mt-1.5 text-m-sub text-crit-ink">{item.error}</p>}
    </li>
  );
};

// 임대인 앱 문서 올리기 시트. 웹 문서 올리기 팝업(DocumentUploadModal)과 같은 규칙으로
// 보관할 곳(내 소유 문서 / 계약 문서) → 계약 → 종류 → 파일을 고르고 [저장]을 누를 때 올린다.
//  - box: 문서함 응답. 올릴 수 있는 곳(isUploadable)·남은 자리(30 − 지금 수)를 여기서 읽는다.
//  - onUploaded(count): 한 번이라도 올라가면 부른다. 모두 올라가면 시트를 닫고, 일부 실패면 실패한 파일만 남긴다.
export const DocumentUploadSheet = ({ box, onClose, onUploaded, onUnauthorized }) => {
  const targets = getUploadTargets(box);
  const [chosenTarget, setChosenTarget] = useState(null);
  const [chosenContractId, setChosenContractId] = useState(null);
  const [chosenType, setChosenType] = useState(null);
  const [savedCount, setSavedCount] = useState(0);
  const { items, notice, isSaving, addFiles, removeItem, save } = useDocumentBoxUploads({ onUnauthorized });

  const isAvailable = (candidate) =>
    (candidate === OWNERSHIP_TARGET && Boolean(targets.ownership)) || (candidate === CONTRACT_TARGET && targets.contracts.length > 0);
  const target = isAvailable(chosenTarget) ? chosenTarget : ([OWNERSHIP_TARGET, CONTRACT_TARGET].find(isAvailable) ?? null);
  const contract = targets.contracts.find((candidate) => candidate.id === chosenContractId) ?? pickDefaultContract(targets.contracts);
  const resource = target === OWNERSHIP_TARGET ? targets.ownership : contract;
  const types = target ? DOCUMENT_TYPES_BY_TARGET[target] : [];
  const documentType = types.includes(chosenType) ? chosenType : types[0];
  const remaining = resource ? getRemainingSlots(resource.documents.length) : 0;
  const capacity = resource ? getSelectableFileCount(resource.documents.length, items.length) : 0;
  const hasFailed = items.some((item) => item.status === 'error');
  const close = isSaving ? () => {} : onClose;

  const handleSave = async () => {
    if (!resource || !documentType || items.length === 0) return;
    const { uploadedCount, failedCount } = await save({ resourceType: target, resourceId: resource.id, documentType });
    if (uploadedCount > 0) {
      setSavedCount((prev) => prev + uploadedCount);
      onUploaded(uploadedCount);
    }
    if (failedCount === 0) onClose();
  };

  if (!target) {
    return (
      <BottomSheet label="문서 올리기" onClose={close}>
        <p className="text-body text-ink-2">지금은 문서를 올릴 수 있는 곳이 없어요.</p>
        <Button variant="secondary" size="h52" onClick={onClose}>
          닫기
        </Button>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet label="문서 올리기" onClose={close}>
      <div className="flex flex-col gap-2">
        <p className={SECTION_LABEL}>어디에 보관할까요</p>
        <div className="grid grid-cols-2 gap-2">
          {[OWNERSHIP_TARGET, CONTRACT_TARGET].map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={target === candidate}
              disabled={!isAvailable(candidate) || isSaving}
              onClick={() => {
                setChosenTarget(candidate);
                setChosenType(null);
              }}
              className={`min-h-11 rounded-input border px-3 text-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                target === candidate ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface text-ink-2'
              }`}
            >
              {TARGET_LABELS[candidate]}
            </button>
          ))}
        </div>
      </div>

      {target === CONTRACT_TARGET && contract && (
        <div className="flex flex-col gap-2">
          <label htmlFor="document-upload-contract" className={SECTION_LABEL}>
            계약
          </label>
          {targets.contracts.length === 1 ? (
            <p id="document-upload-contract" className="rounded-input border border-line bg-surface-2 px-3 py-3 text-body text-ink">
              {formatContractOption(contract)}
            </p>
          ) : (
            <select
              id="document-upload-contract"
              value={contract.id}
              disabled={isSaving}
              onChange={(event) => setChosenContractId(event.target.value)}
              className="h-12 w-full rounded-input border border-line bg-surface px-3 text-body text-ink outline-none focus:border-accent"
            >
              {targets.contracts.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {formatContractOption(candidate)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className={SECTION_LABEL}>종류</p>
        <div className="flex flex-wrap gap-2">
          {types.map((type) => (
            <FilterChip key={type} selected={documentType === type} onClick={() => !isSaving && setChosenType(type)}>
              {DOCUMENT_TYPE_LABELS[type]}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className={SECTION_LABEL}>
          파일 <span className="font-normal text-ink-3">(한 번에 <span className="font-num tabular-nums">{MAX_FILES_PER_BATCH}</span>개 · 남은 자리{' '}
          <span className="font-num tabular-nums">{remaining}</span>개)</span>
        </p>
        {items.length > 0 && (
          <ul aria-label="고른 파일" className="flex flex-col gap-2">
            {items.map((item) => (
              <FileRow key={item.key} item={item} isSaving={isSaving} onRemove={removeItem} />
            ))}
          </ul>
        )}
        {capacity > 0 ? (
          <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-input border border-dashed border-dash px-3 py-3 text-center text-m-sub text-ink-3">
            <Upload size={16} aria-hidden="true" />
            파일 고르기 · PDF·JPG·PNG·WEBP·HEIC {MAX_FILE_SIZE_TEXT}까지
            <input
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              disabled={isSaving}
              aria-label="올릴 파일 고르기"
              className="sr-only"
              onChange={(event) => {
                if (event.target.files?.length) addFiles(event.target.files, capacity);
                event.target.value = '';
              }}
            />
          </label>
        ) : (
          <p className="rounded-input border border-dashed border-dash px-3 py-4 text-center text-m-sub text-ink-3">
            {remaining === 0 ? '이 곳에는 문서를 30개까지 보관할 수 있어요.' : '한 번에 올릴 수 있는 파일을 모두 골랐어요.'}
          </p>
        )}
      </div>

      {notice && <NoticeBox tone={hasFailed ? 'error' : 'warn'}>{notice}</NoticeBox>}
      {savedCount > 0 && hasFailed && (
        <NoticeBox tone="info">
          이미 올린 문서 <span className="font-num tabular-nums">{savedCount}</span>개는 문서함에 남아 있어요. 올리지 못한 파일만 남겼어요.
        </NoticeBox>
      )}

      <div className="flex gap-2.5">
        <Button variant="secondary" size="h52" onClick={onClose} disabled={isSaving}>
          {savedCount > 0 && items.length === 0 ? '닫기' : '취소'}
        </Button>
        <Button size="h52" className="flex-1" onClick={handleSave} disabled={isSaving || items.length === 0}>
          {isSaving ? '올리는 중' : '저장'}
        </Button>
      </div>
    </BottomSheet>
  );
};

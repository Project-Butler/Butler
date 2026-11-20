import { useState } from 'react';
import { Badge, Button, FilterChip } from '@butler/ui';
import { FileSignature, FileText, Image, ShieldCheck, Upload, X } from 'lucide-react';
import { useDocumentBoxUploads } from '../../hooks/useDocumentBoxUploads';
import { ATTACHMENT_ACCEPT, formatFileSize } from '../../utils/attachment';
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
} from '../../utils/documentBox';
import { IconTile } from '../IconTile/IconTile';
import { Modal } from '../Modal/Modal';
import { NoticeBox } from '../NoticeBox/NoticeBox';

const TARGET_CARDS = [
  { target: OWNERSHIP_TARGET, icon: ShieldCheck, title: '내 소유 문서', description: '등기부·매매계약서·보험' },
  { target: CONTRACT_TARGET, icon: FileSignature, title: '계약 문서', description: '계약서·신고필증·영수증·입주 사진' },
];

const SECTION_LABEL = 'text-label font-semibold text-ink';

// 고른 파일 한 줄: 형식 아이콘 · 이름 · 크기 · 상태(대기 · 올리는 중 n% · 오류) · 빼기
const FileRow = ({ item, isSaving, onRemove }) => {
  const isUploading = item.status === 'uploading';
  return (
    <li className="rounded-input border border-line p-2.5">
      <div className="flex items-center gap-2.5">
        <IconTile icon={item.mimeType?.startsWith('image/') ? Image : FileText} tone="mute" size="sm" />
        <span className="min-w-0 flex-1 text-body text-ink">
          <span className="block truncate" title={item.fileName}>
            {item.fileName}
          </span>
          <span className="font-num text-sub tabular-nums text-ink-3">{formatFileSize(item.sizeBytes)}</span>
        </span>
        {item.status === 'pending' && <Badge tone="default">대기</Badge>}
        {isUploading && <Badge tone="warning">올리는 중 <span className="font-num tabular-nums">{Math.round(item.progress * 100)}%</span></Badge>}
        {item.status === 'error' && <Badge tone="danger">올리지 못함</Badge>}
        <button
          type="button"
          aria-label={`${item.fileName} 빼기`}
          disabled={isUploading || isSaving}
          onClick={() => onRemove(item.key)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>
      {isUploading && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}>
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(item.progress * 100)}%` }} />
        </div>
      )}
      {item.status === 'error' && item.error && <p className="mt-1.5 text-sub text-crit-ink">{item.error}</p>}
    </li>
  );
};

// 문서 올리기 팝업. 보관할 곳(내 소유 문서 / 계약 문서) → 계약 → 종류 → 파일 순서로 고르고 [저장]을 누를 때 올린다(Q4).
//  - box: 문서함 응답(GET /properties/:id/documents). 올릴 수 있는 곳(isUploadable)·남은 자리(30 − 지금 수)를 여기서 읽는다.
//  - initialTarget / initialContractId: 칸의 [올리기]로 열면 미리 골라 둔다.
//  - onUploaded(count): 한 번이라도 올라가면 부른다(문서함·목록 수 다시 불러오기). 모두 올라가면 팝업이 onClose를 부른다. 일부 실패면 닫지 않고 실패한 파일만 남긴다.
export const DocumentUploadModal = ({ box, propertyName, initialTarget, initialContractId, onClose, onUploaded, onUnauthorized }) => {
  const targets = getUploadTargets(box);
  const [chosenTarget, setChosenTarget] = useState(initialTarget);
  const [chosenContractId, setChosenContractId] = useState(initialContractId);
  const [chosenType, setChosenType] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const uploads = useDocumentBoxUploads({ onUnauthorized });
  const { items, notice, isSaving, addFiles, removeItem, save } = uploads;

  // 고른 값이 올릴 수 없는 곳이면(미리 고른 값 없음·데이터 갱신) 올릴 수 있는 첫 곳으로 맞춘다.
  const isAvailable = (candidate) =>
    (candidate === OWNERSHIP_TARGET && Boolean(targets.ownership)) || (candidate === CONTRACT_TARGET && targets.contracts.length > 0);
  const target = isAvailable(chosenTarget) ? chosenTarget : [OWNERSHIP_TARGET, CONTRACT_TARGET].find(isAvailable) ?? null;
  const contract =
    targets.contracts.find((candidate) => candidate.id === chosenContractId) ?? pickDefaultContract(targets.contracts);
  const resource = target === OWNERSHIP_TARGET ? targets.ownership : contract;
  const types = target ? DOCUMENT_TYPES_BY_TARGET[target] : [];
  const documentType = types.includes(chosenType) ? chosenType : types[0];

  // 남은 자리는 고른 곳에 이미 있는 문서 수로 센다. 서버 상한(30)은 문서함·올리기 모두 리소스(소유 관계·계약)마다다.
  const remaining = resource ? getRemainingSlots(resource.documents.length) : 0;
  const capacity = resource ? getSelectableFileCount(resource.documents.length, items.length) : 0;

  const handleSelectTarget = (next) => {
    setChosenTarget(next);
    setChosenType(null);
  };

  const handleFiles = (fileList) => {
    if (fileList?.length) addFiles(fileList, capacity);
  };

  const handleSave = async () => {
    if (!resource || !documentType || items.length === 0) return;
    const { uploadedCount, failedCount } = await save({ resourceType: target, resourceId: resource.id, documentType });
    if (uploadedCount > 0) {
      setSavedCount((prev) => prev + uploadedCount);
      onUploaded(uploadedCount);
    }
    if (failedCount === 0) onClose();
  };

  const hasFailed = items.some((item) => item.status === 'error');

  return (
    <Modal
      title="문서 업로드"
      subtitle={propertyName}
      size="lg"
      onClose={isSaving ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            {savedCount > 0 && items.length === 0 ? '닫기' : '취소'}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || items.length === 0 || !resource}>
            {isSaving ? '올리는 중' : '저장'}
          </Button>
        </>
      }
    >
      {!target ? (
        <NoticeBox tone="info">지금은 문서를 올릴 수 있는 곳이 없어요.</NoticeBox>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className={SECTION_LABEL}>어디에 보관할까요</p>
            <div className="grid grid-cols-2 gap-2">
              {TARGET_CARDS.map((card) => {
                const isSelected = target === card.target;
                const isDisabled = !isAvailable(card.target);
                const hint =
                  card.target === OWNERSHIP_TARGET && isDisabled
                    ? '지금은 올릴 수 없어요'
                    : card.target === CONTRACT_TARGET && isDisabled
                      ? '올릴 수 있는 계약이 없어요'
                      : card.description;
                return (
                  <button
                    key={card.target}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isDisabled || isSaving}
                    onClick={() => handleSelectTarget(card.target)}
                    className={`flex items-start gap-2.5 rounded-input border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isSelected ? 'border-2 border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'
                    }`}
                  >
                    <IconTile icon={card.icon} tone="accent" size="sm" />
                    <span>
                      <span className="block text-body font-semibold text-ink">{card.title}</span>
                      <span className="text-sub text-ink-3">{hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {target === CONTRACT_TARGET && contract && (
            <div className="space-y-2">
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
                  className="h-12 w-full rounded-input border border-line bg-surface px-3 text-card text-ink outline-none focus:border-accent"
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

          <div className="space-y-2">
            <p className={SECTION_LABEL}>종류</p>
            <div className="flex flex-wrap gap-2">
              {types.map((type) => (
                <FilterChip key={type} selected={documentType === type} onClick={() => !isSaving && setChosenType(type)}>
                  {DOCUMENT_TYPE_LABELS[type]}
                </FilterChip>
              ))}
            </div>
            <p className="text-sub text-ink-3">‘내 소유 문서’는 등기부·매매계약서·보험·기타, ‘계약 문서’는 계약서·신고필증·영수증·입주 사진·기타가 나와요.</p>
          </div>

          <div className="space-y-2">
            <p className={SECTION_LABEL}>
              파일 (한 번에 최대 <span className="font-num tabular-nums">{MAX_FILES_PER_BATCH}</span>개 · 남은 자리 <span className="font-num tabular-nums">{remaining}</span>개)
            </p>
            {items.length > 0 && (
              <ul className="space-y-2">
                {items.map((item) => (
                  <FileRow key={item.key} item={item} isSaving={isSaving} onRemove={removeItem} />
                ))}
              </ul>
            )}
            {capacity > 0 ? (
              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  if (!isSaving) handleFiles(event.dataTransfer.files);
                }}
                className={`flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-input border border-dashed px-3 py-3 text-center text-sub text-ink-3 transition-colors ${
                  isDragging ? 'border-accent bg-accent-soft' : 'border-dash hover:bg-surface-2'
                }`}
              >
                <Upload size={16} aria-hidden="true" />
                파일을 끌어다 놓거나 눌러서 고르세요 · PDF·JPG·PNG·WEBP·HEIC {MAX_FILE_SIZE_TEXT}까지
                <input
                  type="file"
                  multiple
                  accept={ATTACHMENT_ACCEPT}
                  disabled={isSaving}
                  className="sr-only"
                  onChange={(event) => {
                    handleFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
              </label>
            ) : (
              <p className="rounded-input border border-dashed border-dash px-3 py-4 text-center text-sub text-ink-3">
                {remaining === 0 ? '이 곳에는 문서를 30개까지 보관할 수 있어요. 다른 문서를 지우면 더 올릴 수 있어요.' : '한 번에 올릴 수 있는 파일을 모두 골랐어요.'}
              </p>
            )}
          </div>

          {notice && <NoticeBox tone={hasFailed ? 'error' : 'warn'}>{notice}</NoticeBox>}
          {savedCount > 0 && hasFailed && (
            <NoticeBox tone="info">
              이미 올린 문서 <span className="font-num tabular-nums">{savedCount}</span>개는 문서함에 남아 있어요. 올리지 못한 파일만 남겼어요. 취소하면 이 파일들은 올라가지 않아요.
            </NoticeBox>
          )}
        </div>
      )}
    </Modal>
  );
};

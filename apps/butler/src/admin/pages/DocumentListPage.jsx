import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, FilterChip, Pagination } from '@butler/ui';
import { ArrowUpRight, FileImage, FileText, FileVideo, Info } from 'lucide-react';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import { DOCUMENT_RESOURCE_LABEL, DOCUMENT_RESOURCE_TYPES, ROLE_LABEL } from '../constants/labels';
import { useGetAdminDocumentList } from '../hooks/useGetAdminDocumentList';
import { formatDateTime } from '../utils/formatDate';
import { getDocumentTypeLabel } from '../../shared/documentTypeLabels';

const PAGE_SIZE = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inputClass =
  'h-11 rounded-input border border-line bg-surface px-3 font-num text-body text-ink outline-none placeholder:text-ink-3 focus:border-accent';

// 형식(mimeType)만 보고 아이콘을 고른다. 파일 내용은 보지 않는다.
const FileIcon = ({ mimeType }) => {
  const Icon = mimeType?.startsWith('image/') ? FileImage : mimeType?.startsWith('video/') ? FileVideo : FileText;
  return <Icon size={16} className="shrink-0 text-ink-3" aria-hidden="true" />;
};

const formatSize = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
};

// 첨부 위치. 서버가 계산한 link가 있으면(계약·수리 요청·갱신 통지) 그 상세로 가고, 없으면 글자만.
const ResourceCell = ({ document, onNavigate }) => {
  const label = DOCUMENT_RESOURCE_LABEL[document.resourceType] ?? document.resourceType;
  const { link } = document;
  if (!link) return <span className="text-ink-2">{label}</span>;
  const go = () =>
    link.type === 'TICKET' ? onNavigate('ticketDetail', { ticketId: link.id }) : onNavigate('contractDetail', { contractId: link.id });
  return (
    <button type="button" onClick={go} className="inline-flex items-center gap-0.5 font-semibold text-accent underline underline-offset-2">
      {label}
      <ArrowUpRight size={14} aria-hidden="true" />
    </button>
  );
};

// 관리자 문서 목록(docs/18 계획 v3). 올라온 문서의 메타데이터만 보여 준다 — 파일을 여는 버튼·링크는 두지 않는다.
// 첨부 위치·등록일·등록자 조건과 쪽 번호는 URL 쿼리에 둔다(회원 상세의 '이 회원이 등록한 문서'가 ?uploaderId=로 들어온다).
export const DocumentListPage = ({ onNavigate, onUnauthorized }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const resourceType = searchParams.get('resourceType') ?? '';
  const from = searchParams.get('from') ?? '';
  const until = searchParams.get('until') ?? '';
  const uploaderId = searchParams.get('uploaderId') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const selectedTypes = resourceType ? resourceType.split(',') : [];

  const [uploaderInput, setUploaderInput] = useState(uploaderId);
  const [uploaderError, setUploaderError] = useState(null);
  useEffect(() => setUploaderInput(uploaderId), [uploaderId]);

  const { data, error, isLoading, refetch } = useGetAdminDocumentList(
    { resourceType, uploaderId, from, until, page, size: PAGE_SIZE },
    { onUnauthorized },
  );

  // 조건이 바뀌면 1쪽으로 돌아간다. 빈 값은 URL에서 뺀다.
  // [찾기]를 누르지 않은 등록자 입력은 지금 적용된 값으로 되돌려, 입력칸과 실제 조건이 어긋나 보이지 않게 한다.
  const updateParams = (changes) => {
    if (!('uploaderId' in changes)) {
      setUploaderInput(uploaderId);
      setUploaderError(null);
    }
    const next = new URLSearchParams(searchParams);
    Object.entries({ page: undefined, ...changes }).forEach(([key, value]) => {
      if (value) next.set(key, String(value));
      else next.delete(key);
    });
    setSearchParams(next);
  };

  // 칩을 아무것도 안 고르면 모든 종류다.
  const toggleType = (type) => {
    const next = selectedTypes.includes(type) ? selectedTypes.filter((item) => item !== type) : [...selectedTypes, type];
    updateParams({ resourceType: DOCUMENT_RESOURCE_TYPES.filter((item) => next.includes(item)).join(',') });
  };

  const handleUploaderSubmit = (event) => {
    event.preventDefault();
    const trimmed = uploaderInput.trim();
    if (trimmed && !UUID_PATTERN.test(trimmed)) {
      setUploaderError('회원 ID(UUID) 형식이 아닙니다.');
      return;
    }
    setUploaderError(null);
    updateParams({ uploaderId: trimmed });
  };

  // 기간이 뒤바뀌면 서버가 400으로 거절하므로, 반대쪽 날짜를 방금 고른 날로 맞춘다(입력을 말없이 버리지 않는다).
  const handleDateChange = (field, value) => {
    const nextFrom = field === 'from' ? value : from;
    const nextUntil = field === 'until' ? value : until;
    if (nextFrom && nextUntil && nextFrom > nextUntil) {
      updateParams({ from: value, until: value });
      return;
    }
    updateParams({ [field]: value });
  };

  const totalPages = data ? Math.ceil(data.meta.total / data.meta.size) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-h1 font-bold text-ink">문서</h2>
          <p className="mt-1 text-body text-ink-2">올라온 문서의 목록만 봅니다. 파일 내용은 이 화면에서 열 수 없어요.</p>
        </div>
        {data && <span className="font-num text-body text-ink-3">총 {data.meta.total.toLocaleString('ko-KR')}건</span>}
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="첨부 위치">
          <span className="mr-1 w-16 text-chip font-semibold text-ink-3">첨부 위치</span>
          {DOCUMENT_RESOURCE_TYPES.map((type) => (
            <FilterChip key={type} selected={selectedTypes.includes(type)} onClick={() => toggleType(type)}>
              {DOCUMENT_RESOURCE_LABEL[type]}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="mr-1 w-16 text-chip font-semibold text-ink-3">등록일</span>
          <input
            type="date"
            aria-label="등록일 시작"
            value={from}
            max={until || undefined}
            onChange={(event) => handleDateChange('from', event.target.value)}
            className={`${inputClass} w-44`}
          />
          <span className="text-ink-3">~</span>
          <input
            type="date"
            aria-label="등록일 끝"
            value={until}
            min={from || undefined}
            onChange={(event) => handleDateChange('until', event.target.value)}
            className={`${inputClass} w-44`}
          />
          <form onSubmit={handleUploaderSubmit} noValidate className="flex items-start gap-2" role="search">
            <label className="flex flex-col gap-1">
              <span className="sr-only">등록자 회원 ID</span>
              <input
                value={uploaderInput}
                onChange={(event) => {
                  setUploaderInput(event.target.value);
                  setUploaderError(null);
                }}
                placeholder="등록자 (회원 ID)"
                aria-invalid={Boolean(uploaderError)}
                className={`${inputClass} w-80 ${uploaderError ? 'border-crit-ink' : ''}`}
              />
              {uploaderError && (
                <span role="alert" className="text-chip text-crit-ink">
                  {uploaderError}
                </span>
              )}
            </label>
            <Button type="submit" variant="secondary">
              찾기
            </Button>
          </form>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {error && (
          <StatusMessage tone="error" onRetry={refetch}>
            {error.message}
          </StatusMessage>
        )}
        {isLoading && !data && <StatusMessage>불러오는 중입니다</StatusMessage>}
        {data && data.items.length === 0 && <StatusMessage>조건에 맞는 문서가 없습니다.</StatusMessage>}
        {data && data.items.length > 0 && (
          <div className={`overflow-x-auto ${isLoading ? 'opacity-60' : ''}`}>
            <table className="w-full text-body">
              <thead>
                <tr className="border-b border-line text-left text-chip text-ink-3">
                  <th className="px-5 py-2 font-medium">등록일</th>
                  <th className="px-3 py-2 font-medium">파일 이름</th>
                  <th className="px-3 py-2 font-medium">종류</th>
                  <th className="px-3 py-2 font-medium">크기</th>
                  <th className="px-3 py-2 font-medium">첨부 위치</th>
                  <th className="px-3 py-2 font-medium">호실</th>
                  <th className="px-5 py-2 font-medium">등록자</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((document) => (
                  <tr key={document.id} className="border-b border-line last:border-b-0">
                    <td className="whitespace-nowrap px-5 py-3 font-num text-chip text-ink-2">{formatDateTime(document.createdAt)}</td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1.5 break-all">
                        <FileIcon mimeType={document.mimeType} />
                        {document.fileName}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-chip text-ink-2">{getDocumentTypeLabel(document.documentType)}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-num text-chip text-ink-3">{formatSize(document.sizeBytes)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-chip">
                      <ResourceCell document={document} onNavigate={onNavigate} />
                    </td>
                    <td className="px-3 py-3 text-chip text-ink-2">{document.property?.displayName ?? '-'}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-chip text-ink-2">
                      {ROLE_LABEL[document.uploader.role] ?? document.uploader.role} · {document.uploader.name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination page={page} totalPages={totalPages} onChange={(next) => updateParams({ page: next })} />

      <p className="flex items-center gap-1.5 text-chip text-ink-3">
        <Info size={14} aria-hidden="true" />
        아직 첨부되지 않은 임시 파일과 삭제한 문서는 목록에 나오지 않아요.
      </p>
    </div>
  );
};

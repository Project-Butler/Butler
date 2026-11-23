import { useState } from 'react';
import { ChevronRight, FileText, FileVideo, Image, ShieldCheck, Upload, Wrench } from 'lucide-react';
import { Button } from '@butler/ui';
import { postDocumentDownloadUrl } from '@butler/api-client';
import { DocumentViewer } from '../../../shared/documentViewer/DocumentViewer';
import { isImageDocument, isVideoDocument } from '../../../shared/documentViewer/documentFiles';
import { useDocumentUrls } from '../../../shared/documentViewer/useDocumentUrls';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useGetPropertyDocumentBox } from '../../web/hooks/useGetPropertyDocumentBox';
import { hasUploadTarget } from '../../web/utils/documentBox';
import searchIcon from '../assets/icon-search.svg';
import { AppTabShell } from '../components/AppTabShell/AppTabShell';
import { DocumentUploadSheet } from '../components/DocumentUploadSheet/DocumentUploadSheet';
import {
  ALL_CATEGORY,
  countByCategory,
  describeDocument,
  DOCUMENT_CATEGORIES,
  filterDocuments,
  findCategory,
  flattenDocuments,
  RECENT_LIMIT,
} from '../utils/documentBoxView';
import { useGoBack, useGoTo } from '../utils/navigation';

const CARD_CLASS = 'rounded-card border border-line bg-surface';
const CATEGORY_ICONS = { contract: FileText, registry: ShieldCheck, receipt: Wrench, photo: Image };

const Loading = () => (
  <p role="status" className="py-10 text-center text-body text-ink-3">
    불러오는 중입니다
  </p>
);

const DocumentRow = ({ document, onOpen }) => {
  const { typeLabel, date, size } = describeDocument(document);
  const Icon = isImageDocument(document) ? Image : isVideoDocument(document) ? FileVideo : FileText;
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" onClick={() => onOpen(document)} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-surface-2 text-ink-2">
          <Icon size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-ink">{document.fileName}</span>
          <span className="block text-m-sub text-ink-3">
            {typeLabel}
            {date && (
              <>
                {' · '}
                <span className="font-num tabular-nums">{date}</span>
              </>
            )}
            {size && (
              <>
                {' · '}
                <span className="font-num tabular-nums">{size}</span>
              </>
            )}
          </span>
        </span>
      </button>
    </li>
  );
};

const DocumentList = ({ documents, label, onOpen }) => (
  <ul aria-label={label} className={`${CARD_CLASS} px-4`}>
    {documents.map((document) => (
      <DocumentRow key={document.id} document={document} onOpen={onOpen} />
    ))}
  </ul>
);

const CategoryCard = ({ category, count, onOpen }) => {
  const Icon = CATEGORY_ICONS[category.key];
  return (
    <button type="button" aria-label={`${category.label} ${count}개`} onClick={onOpen} className={`${CARD_CLASS} flex w-full flex-col gap-3 p-4 text-left`}>
      <Icon size={20} className="text-accent" aria-hidden="true" />
      <span className="flex items-center justify-between gap-2">
        <span className="text-body font-semibold text-ink">{category.label}</span>
        <span className="font-num text-num-body tabular-nums text-ink-2">{count}</span>
      </span>
    </button>
  );
};

// 임대인 앱 문서함 (Figma M11). 내 자산 → 부동산 상세 [문서] 탭 → [문서함 열기]로 들어오는 호실 하나의 문서함이다.
// 웹 문서함과 같은 API(GET /properties/:propertyId/documents)를 쓰고, 종류 카드는 documentType 을 화면 묶음으로 센다.
// category(주소의 ?type): null 이면 첫 화면(종류 카드 + 최근 문서), 'all'·묶음 key 면 그 목록. 검색은 파일 이름으로 이 호실 안에서만 찾는다.
// 시안의 저장 공간·암호화 안내는 API·정책이 없어 두지 않는다. 문서 삭제는 웹 문서함에서 한다.
// 열기: 사진은 공용 뷰어(누를 때 새 주소 — 감사), 그 밖(PDF 등)은 새 탭.
export const DocumentBoxPage = ({ propertyId, category, onUnauthorized }) => {
  const goTo = useGoTo();
  const goBack = useGoBack(propertyId ? 'propertyDetail' : 'buildingList', { propertyId });
  const box = useGetPropertyDocumentBox(propertyId, { onUnauthorized });
  const urls = useDocumentUrls(postDocumentDownloadUrl);
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [openError, setOpenError] = useState(null);

  const data = box.data;
  const canUpload = Boolean(data && hasUploadTarget(data));
  const uploadAction = canUpload ? (
    <button
      type="button"
      aria-label="문서 올리기"
      onClick={() => setIsUploadOpen(true)}
      className="flex h-11 w-11 items-center justify-center rounded-input text-accent"
    >
      <Upload size={22} aria-hidden="true" />
    </button>
  ) : null;
  const backBar = { title: '문서함', onBack: goBack, action: uploadAction };

  if (!propertyId) {
    return (
      <AppTabShell backBar={{ title: '문서함', onBack: goBack }}>
        <section className={`${CARD_CLASS} flex flex-col items-center gap-3 px-5 py-10 text-center`}>
          <p className="text-body text-ink-2">문서함은 부동산마다 있어요. 내 자산에서 부동산을 골라 [문서] 탭으로 들어와 주세요.</p>
          <Button size="h44" onClick={() => goTo('buildingList')}>
            내 자산으로
          </Button>
        </section>
      </AppTabShell>
    );
  }

  if (!data) {
    return <AppTabShell backBar={backBar}>{box.error ? <NoticeBox>{box.error.message}</NoticeBox> : <Loading />}</AppTabShell>;
  }

  const documents = flattenDocuments(data);
  const counts = countByCategory(documents);
  const keyword = query.trim();
  const isListView = Boolean(category) || Boolean(keyword);
  const listed = filterDocuments(documents, { category, query: keyword });
  const listTitle = category === ALL_CATEGORY || !category ? (keyword ? '검색 결과' : '전체 문서') : findCategory(category).label;

  const openCategory = (key) => goTo('documents', { propertyId, type: key });
  const handleOpen = async (document) => {
    setOpenError(null);
    // 사진은 크게 보기, 동영상은 뷰어에서 재생. 그 밖(PDF 등)은 새 탭.
    if (isImageDocument(document) || isVideoDocument(document)) {
      setViewing(document);
      return;
    }
    const isOpened = await urls.open(document);
    if (!isOpened) setOpenError('문서를 열지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
  };
  const handleUploaded = (count) => {
    setNotice(`문서 ${count}개를 올렸어요.`);
    box.refetch();
  };

  return (
    <AppTabShell backBar={backBar}>
      <div className="flex flex-col gap-3.5">
        <p className="text-m-sub text-ink-3">{data.property.displayName}</p>
        {notice && (
          <p role="status" className="rounded-input bg-accent-soft px-4 py-3 text-body font-medium text-accent-strong">
            {notice}
          </p>
        )}
        {box.error && <NoticeBox>{box.error.message}</NoticeBox>}
        {openError && <NoticeBox>{openError}</NoticeBox>}

        <label className="flex h-12 items-center gap-2 rounded-card border border-line bg-surface px-4 focus-within:border-accent">
          <input
            type="search"
            aria-label="문서 이름 검색"
            placeholder="문서 이름 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
          />
          <img src={searchIcon} alt="" width={18} height={18} />
        </label>

        {isListView ? (
          <section aria-label={listTitle} className="flex flex-col gap-2.5">
            <h2 className="text-m-card font-semibold text-ink">
              {listTitle} <span className="font-num tabular-nums text-ink-3">{listed.length}</span>
            </h2>
            {listed.length > 0 ? (
              <DocumentList documents={listed} label={`${listTitle} 목록`} onOpen={handleOpen} />
            ) : (
              <p className="py-10 text-center text-body text-ink-3">{keyword ? '찾는 문서가 없어요' : '이 종류의 문서가 없어요'}</p>
            )}
          </section>
        ) : (
          <>
            <ul aria-label="문서 종류" className="grid grid-cols-2 gap-2.5">
              {DOCUMENT_CATEGORIES.map((item) => (
                <li key={item.key} className="flex">
                  <CategoryCard category={item} count={counts[item.key]} onOpen={() => openCategory(item.key)} />
                </li>
              ))}
            </ul>

            <section aria-label="최근 문서" className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-m-card font-semibold text-ink">최근 문서</h2>
                {documents.length > 0 && (
                  <button type="button" onClick={() => openCategory(ALL_CATEGORY)} className="flex min-h-11 items-center gap-0.5 text-body font-semibold text-accent">
                    전체
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              {documents.length > 0 ? (
                <DocumentList documents={documents.slice(0, RECENT_LIMIT)} label="최근 문서 목록" onOpen={handleOpen} />
              ) : (
                <section aria-label="문서 없음" className={`${CARD_CLASS} flex flex-col items-center gap-3 px-5 py-10 text-center`}>
                  <p className="text-body text-ink-2">아직 올린 문서가 없어요</p>
                  {canUpload && (
                    <Button size="h44" onClick={() => setIsUploadOpen(true)}>
                      문서 올리기
                    </Button>
                  )}
                </section>
              )}
            </section>
          </>
        )}

        <p className="text-m-sub text-ink-3">하우스 로그·수리 요청에 붙인 사진은 각 기록에서 봐요. 문서 삭제는 웹 문서함에서 할 수 있어요.</p>
      </div>

      {isUploadOpen && (
        <DocumentUploadSheet box={data} onClose={() => setIsUploadOpen(false)} onUploaded={handleUploaded} onUnauthorized={onUnauthorized} />
      )}
      {viewing && <DocumentViewer documents={[viewing]} urls={urls} onClose={() => setViewing(null)} />}
    </AppTabShell>
  );
};

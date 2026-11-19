import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@butler/ui';
import { getTodayKST } from '../contractFormat';
import { addRecentSearch, readRecentSearches, removeRecentSearch } from './recentSearches';
import {
  countResults,
  describeDocument,
  describeProperty,
  describeSchedule,
  describeTicket,
  formatShortDate,
  getScheduleDday,
  isImageDocument,
  MAX_QUERY_LENGTH,
  normalizeQuery,
  SECTIONS,
  splitHighlight,
} from './searchView';
import { useGetSearch } from './useGetSearch';

// 통합 검색(피그마 M13, 계약 7장 v1.1). 임대인 앱·임차인이 같이 쓰는 화면이다.
// 검색어는 주소의 ?q= 에 남겨, 결과를 눌렀다가 뒤로 오면 같은 결과가 다시 보인다.
// 결과를 누르면 onOpen(sectionKey, item)을 부른다 — 어디로 갈지는 역할 화면이 정한다.
// props: userId(최근 검색어 구분), shell(data-shell), onBack, onOpen, onUnauthorized

const Icon = ({ children, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const BackIcon = () => (
  <Icon size={22}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);
const ClearIcon = () => (
  <Icon size={18}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
const ChevronIcon = () => (
  <Icon size={18}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
const BuildingIcon = () => (
  <Icon>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <path d="M9 21v-4h6v4M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01" />
  </Icon>
);
const ImageIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </Icon>
);
const FileIcon = () => (
  <Icon>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Icon>
);
const CalendarIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
);
const WrenchIcon = () => (
  <Icon>
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
  </Icon>
);
const ContractIcon = () => (
  <Icon>
    <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Icon>
);

// 검색어 단어를 굵게
const Highlight = ({ text, query }) =>
  splitHighlight(text, query).map((part, index) =>
    part.match ? (
      <strong key={index} className="font-bold text-ink">
        {part.text}
      </strong>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );

const IconBox = ({ children }) => (
  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-surface-2 text-ink-2">{children}</span>
);

// 아이콘 + 제목 + 설명 한 줄짜리 결과 카드
const RowCard = ({ icon, title, sub, trailing, query, onClick }) => (
  <li>
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 text-left">
      <IconBox>{icon}</IconBox>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-card-sm font-medium text-ink-2">
          <Highlight text={title} query={query} />
        </span>
        {sub && <span className="mt-0.5 block truncate font-num text-num-sub text-ink-3">{sub}</span>}
      </span>
      {trailing}
    </button>
  </li>
);

// 날짜 + 제목 목록(관리 로그). 한 카드 안에 줄로 나눈다.
const DatedListCard = ({ items, query, onOpen }) => (
  <li className="overflow-hidden rounded-card border border-line bg-surface">
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" onClick={() => onOpen(item)} className="flex w-full items-center gap-4 px-4 py-3.5 text-left">
            <span className="shrink-0 font-num text-num-sub text-ink-3 tabular-nums">{item.date}</span>
            <span className="min-w-0 flex-1 truncate text-card-sm text-ink-2">
              <Highlight text={item.title} query={query} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  </li>
);

const SectionItems = ({ sectionKey, items, query, today, onOpen }) => {
  const open = (item) => onOpen(sectionKey, item);
  switch (sectionKey) {
    case 'properties':
      return items.map((item) => (
        <RowCard
          key={item.id}
          icon={<BuildingIcon />}
          title={item.displayName}
          sub={describeProperty(item)}
          trailing={
            <span className="text-ink-3">
              <ChevronIcon />
            </span>
          }
          query={query}
          onClick={() => open(item)}
        />
      ));
    case 'managementLogs':
      return (
        <DatedListCard
          items={items.map((item) => {
            // 제목에 호실이 없으면 앞에 붙인다('101호 보일러 수리 완료')
            const unit = `${item.property.unitNo}호`;
            return { ...item, date: formatShortDate(item.occurredOn), title: item.title.includes(unit) ? item.title : `${unit} ${item.title}` };
          })}
          query={query}
          onOpen={open}
        />
      );
    case 'documents':
      return items.map((item) => (
        <RowCard
          key={item.id}
          icon={isImageDocument(item) ? <ImageIcon /> : <FileIcon />}
          title={item.fileName}
          sub={describeDocument(item)}
          query={query}
          onClick={() => open(item)}
        />
      ));
    case 'schedules':
      return items.map((item) => {
        const dday = getScheduleDday(item, today);
        return (
          <RowCard
            key={item.id}
            icon={<CalendarIcon />}
            title={item.property ? `${item.title} · ${item.property.unitNo}호` : item.title}
            sub={describeSchedule(item)}
            trailing={dday && <Badge tone="warning">{dday}</Badge>}
            query={query}
            onClick={() => open(item)}
          />
        );
      });
    case 'tickets':
      return items.map((item) => (
        <RowCard
          key={item.id}
          icon={<WrenchIcon />}
          title={item.title}
          sub={`${item.property.displayName} · ${describeTicket(item)}`}
          query={query}
          onClick={() => open(item)}
        />
      ));
    case 'contracts':
      return items.map((item) => (
        <RowCard
          key={item.id}
          icon={<ContractIcon />}
          title={`${item.tenantName} · ${item.property.displayName}`}
          sub={`${item.startDate} ~ ${item.endDate}`}
          query={query}
          onClick={() => open(item)}
        />
      ));
    default:
      return null;
  }
};

const RecentSearches = ({ items, onPick, onRemove }) => (
  <div className="flex items-center gap-2 overflow-x-auto pb-1">
    <span className="shrink-0 text-m-sub text-ink-3">최근</span>
    {items.map((item) => (
      <span key={item} className="flex shrink-0 items-center rounded-full bg-surface-2 text-m-chip text-ink-2">
        <button type="button" onClick={() => onPick(item)} className="py-1 pl-3 pr-1">
          {item}
        </button>
        <button type="button" aria-label={`최근 검색어 ${item} 지우기`} onClick={() => onRemove(item)} className="py-1 pl-0.5 pr-2 text-ink-3">
          ×
        </button>
      </span>
    ))}
  </div>
);

const Message = ({ children }) => <p className="py-12 text-center text-m-label text-ink-3">{children}</p>;

export const SearchPage = ({ userId, shell, onBack, onOpen, onUnauthorized }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(() => searchParams.get('q') ?? '');
  const [recent, setRecent] = useState(() => readRecentSearches(userId));
  const inputRef = useRef(null);
  const { data, searchedQuery, error, isLoading, query, searchable } = useGetSearch(input, { onUnauthorized });
  const today = getTodayKST();

  useEffect(() => {
    if (!searchParams.get('q')) inputRef.current?.focus();
    // 처음 열 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 주소의 ?q= 를 입력과 맞춘다(기록은 늘리지 않는다).
  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (current === query) return;
    setSearchParams(query ? { q: query } : {}, { replace: true });
  }, [query, searchParams, setSearchParams]);

  const remember = useCallback(
    (value) => {
      const normalized = normalizeQuery(value);
      if (normalized) setRecent(addRecentSearch(userId, normalized));
    },
    [userId],
  );

  const handleOpen = (sectionKey, item) => {
    remember(searchedQuery);
    onOpen(sectionKey, item);
  };

  const showResults = searchable && data && searchedQuery;
  const total = countResults(data);

  return (
    <div data-shell={shell} className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-ground font-sans text-ink md:border-x md:border-line">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-1 border-b border-line bg-surface pl-1 pr-4">
        <button type="button" aria-label="뒤로 가기" onClick={onBack} className="flex h-11 w-11 shrink-0 items-center justify-center text-ink">
          <BackIcon />
        </button>
        <form
          role="search"
          className="relative min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (searchable) remember(query);
            inputRef.current?.blur();
          }}
        >
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            aria-label="통합 검색"
            placeholder="호실, 기록, 문서, 일정 검색"
            maxLength={MAX_QUERY_LENGTH}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="h-11 w-full rounded-btn border-[1.5px] border-accent bg-surface pl-4 pr-10 text-m-card text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {input && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => {
                setInput('');
                inputRef.current?.focus();
              }}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-ink-2"
            >
              <ClearIcon />
            </button>
          )}
        </form>
      </header>

      <main className="flex-1 px-5 pb-8 pt-4" aria-busy={isLoading}>
        {recent.length > 0 && (
          <RecentSearches items={recent} onPick={(item) => setInput(item)} onRemove={(item) => setRecent(removeRecentSearch(userId, item))} />
        )}

        {!searchable && <Message>{query.length === 1 ? '두 글자 이상 입력해 주세요.' : '호실·관리 로그·문서·일정을 한 번에 찾아요.'}</Message>}
        {searchable && error && <Message>{error.message ?? '검색하지 못했어요. 잠시 후 다시 시도해 주세요.'}</Message>}
        {searchable && !error && !showResults && isLoading && <Message>검색하고 있어요…</Message>}
        {showResults && !error && total === 0 && <Message>‘{searchedQuery}’ 검색 결과가 없어요.</Message>}

        {showResults && !error && total > 0 && (
          <div className={`mt-4 flex flex-col gap-6 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
            {SECTIONS.filter(({ key }) => data[key]?.length > 0).map(({ key, title }) => (
              <section key={key} aria-label={title}>
                <h2 className="mb-2.5 text-m-label font-semibold text-ink-2">
                  {title} <span className="font-num tabular-nums">{data[key].length}</span>
                </h2>
                <ul className="flex flex-col gap-2">
                  <SectionItems sectionKey={key} items={data[key]} query={searchedQuery} today={today} onOpen={handleOpen} />
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

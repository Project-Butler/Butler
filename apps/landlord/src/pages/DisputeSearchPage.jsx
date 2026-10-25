import { useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button, FilterChip, Pagination, SegmentedControl } from '@butler/ui';
import { AskAiCard } from '../components/DisputeReference/AskAiCard';
import { FaqList } from '../components/DisputeReference/FaqList';
import { LegalNotice } from '../components/DisputeReference/LegalNotice';
import { ReferenceCard } from '../components/DisputeReference/ReferenceCard';
import { SearchBox } from '../components/DisputeReference/SearchBox';
import { TopicTile } from '../components/DisputeReference/TopicTile';
import { useGetDisputeFaqList } from '../hooks/useGetDisputeFaqList';
import { useGetDisputeReferenceList } from '../hooks/useGetDisputeReferenceList';
import { DISPUTE_TOPICS, findTopic, REFERENCE_TYPES } from '../utils/disputeReference';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

const PAGE_SIZE = 5;
// 전체 탭에서 자료 위에 먼저 보여 줄 질문 수. 나머지는 질문 탭에서 본다.
const FAQ_PREVIEW_COUNT = 3;
// 글자를 칠 때마다 요청하지 않도록 입력이 멈추고 이만큼 지나면 검색한다.
const SEARCH_DELAY_MS = 300;

const ALL_TAB = 'ALL';
const FAQ_TAB = 'FAQ';
const REFERENCE_TYPE_VALUES = REFERENCE_TYPES.map(({ value }) => value);

const sum = (values) => values.reduce((total, value) => total + value, 0);

// 분쟁 해결사: 검색창 하나와 상황 칩으로 자주 묻는 질문과 사례·판례·가이드라인을 함께 찾는다.
// 아무 조건이 없으면 상황 타일을 보여 주고, 조건이 생기면 같은 자리에 결과를 보여 준다(화면 이동 없음).
// 조건(topic·q·tab)은 주소에 둬서 사례 상세에서 돌아와도 그대로 남는다.
export const DisputeSearchPage = () => {
  const { askAi, openReference, onUnauthorized } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const topic = findTopic(searchParams.get('topic'));
  const q = searchParams.get('q') ?? '';
  const tab = searchParams.get('tab') ?? ALL_TAB;
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const isIdle = !topic && !q;

  const [keyword, setKeyword] = useState(q);
  const resultsRef = useRef(null);

  // 상황 선택·쪽 이동은 뒤로 가기로 되돌릴 수 있게 기록을 남기고(push), 글자 입력·탭은 덮어쓴다(replace).
  // 쪽(page)을 직접 바꾸지 않는 변경은 조건이 바뀐 것이라 1쪽으로 돌아간다.
  const updateParams = (changes, { push = false } = {}) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!('page' in changes)) next.delete('page');
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: !push },
    );

  // 새로 검색하면 고른 상황을 풀고 전체에서 찾는다(다른 내용을 찾으려고 칩을 직접 끌 필요가 없게).
  // 검색 뒤에 칩을 누르면 그 결과를 상황으로 좁힌다. 검색어를 지우기만 할 때는 상황을 그대로 둔다.
  const search = (trimmed) => updateParams(trimmed ? { q: trimmed, topic: null } : { q: null });

  // 입력이 바뀔 때만 타이머를 다시 건다. 주소(q)와 search는 렌더마다 바뀌어서 최신 값을 ref로 읽는다.
  const latestRef = useRef({ q, search });
  latestRef.current = { q, search };

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = keyword.trim();
      if (trimmed !== latestRef.current.q) latestRef.current.search(trimmed);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [keyword]);

  // 뒤로 가기 등으로 주소의 검색어가 바뀌면 입력창도 맞춘다.
  useEffect(() => {
    setKeyword((current) => (current.trim() === q ? current : q));
  }, [q]);

  const category = topic ? topic.categories.join(',') : undefined;
  const faqs = useGetDisputeFaqList({ category, q: q || undefined });
  // 처음 화면에서는 타일 숫자(유형별 자료 수)만 쓰려고 한 건만 받는다.
  const list = useGetDisputeReferenceList(
    isIdle
      ? { size: 1 }
      : { type: REFERENCE_TYPE_VALUES.includes(tab) ? tab : undefined, category, q: q || undefined, page, size: PAGE_SIZE },
  );

  useEffect(() => {
    if (isUnauthorizedError(list.error) || isUnauthorizedError(faqs.error)) onUnauthorized?.();
  }, [list.error, faqs.error, onUnauthorized]);

  const faqItems = faqs.data ?? [];
  const references = list.data?.data ?? [];
  const meta = list.data?.meta;
  const countsByType = meta?.countsByType;
  const countsByCategory = meta?.countsByCategory;
  const referenceTotal = countsByType ? sum(Object.values(countsByType)) : undefined;
  const isCounting = countsByType === undefined || faqs.data === undefined;

  const tabs = [
    { value: ALL_TAB, label: '전체', count: isCounting ? undefined : faqItems.length + referenceTotal },
    { value: FAQ_TAB, label: '질문', count: faqs.data?.length },
    ...REFERENCE_TYPES.map(({ value, label }) => ({ value, label, count: countsByType?.[value] })),
  ];

  // 질문은 전체 탭 1쪽에서만 몇 개 미리 보여 주고, 질문 탭에서 전부 보여 준다.
  const shownFaqs = tab === FAQ_TAB ? faqItems : tab === ALL_TAB && page === 1 ? faqItems.slice(0, FAQ_PREVIEW_COUNT) : [];
  const showReferences = tab !== FAQ_TAB;
  const totalPages = meta ? Math.ceil(meta.total / PAGE_SIZE) : 0;
  const hasNoResult = !isCounting && faqItems.length + referenceTotal === 0;

  const selectTopic = (key) => updateParams({ topic: topic?.key === key ? null : key, tab: null }, { push: true });
  const resetToTiles = () => {
    setKeyword('');
    updateParams({ topic: null, q: null, tab: null }, { push: true });
  };
  const changePage = (nextPage) => {
    updateParams({ page: nextPage > 1 ? String(nextPage) : null }, { push: true });
    resultsRef.current?.scrollIntoView?.({ block: 'start' });
  };

  const tileCount = (categories) =>
    countsByCategory ? sum(categories.map((item) => countsByCategory[item] ?? 0)) : undefined;
  const tileQuestion = (categories) => faqItems.find((faq) => categories.includes(faq.category))?.question;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* 결과 화면의 [처음으로]는 제목 줄 오른쪽에 둬서, 생겨도 제목 위치·줄 높이(44)가 바뀌지 않게 한다. */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 className="text-h1 font-semibold text-ink">분쟁 해결사</h2>
        {!isIdle && (
          <button
            type="button"
            onClick={resetToTiles}
            className="-mr-2 flex min-h-11 shrink-0 items-center gap-1 rounded-input px-2 text-label font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ChevronLeft size={16} />
            처음으로
          </button>
        )}
      </div>

      <SearchBox
        value={keyword}
        onChange={setKeyword}
        onSubmit={(trimmed) => trimmed !== q && search(trimmed)}
        onClear={() => {
          setKeyword('');
          updateParams({ q: null });
        }}
      />

      {/* 처음 화면에서는 같은 상황을 타일로 고르므로, 칩은 결과 화면에서 다른 상황으로 바꿀 때만 보여 준다. */}
      {!isIdle && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="상황">
          {DISPUTE_TOPICS.map((item) => (
            <FilterChip key={item.key} selected={topic?.key === item.key} onClick={() => selectTopic(item.key)}>
              {item.label}
            </FilterChip>
          ))}
        </div>
      )}

      {isIdle ? (
        <>
          <h3 className="pt-2 text-section font-semibold text-ink">어떤 상황인가요?</h3>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {DISPUTE_TOPICS.map((item) => (
              <li key={item.key}>
                <TopicTile
                  topic={item}
                  count={tileCount(item.categories)}
                  sampleQuestion={tileQuestion(item.categories)}
                  onClick={() => selectTopic(item.key)}
                />
              </li>
            ))}
          </ul>
          <AskAiCard onClick={() => askAi()} />
        </>
      ) : (
        <>
          {/* 쪽을 넘기면 이 탭 줄로 올라온다. 빈 칸을 따로 두면 flex 간격이 한 번 더 붙어서 탭에 직접 단다. */}
          <div ref={resultsRef} className="scroll-mt-4">
            <SegmentedControl
              ariaLabel="결과 종류"
              value={tab}
              onChange={(value) => updateParams({ tab: value === ALL_TAB ? null : value })}
              options={tabs}
            />
          </div>

          {(list.error || faqs.error) && !isUnauthorizedError(list.error) && !isUnauthorizedError(faqs.error) && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-card border border-crit bg-crit-soft px-4 py-3">
              <p className="text-body text-crit-ink">{toApiError(list.error ?? faqs.error).message}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  list.refetch();
                  faqs.refetch();
                }}
                className="min-h-11 shrink-0"
              >
                다시 시도
              </Button>
            </div>
          )}

          {isCounting && !list.error && !faqs.error && (
            <p className="py-6 text-center text-body text-ink-3">찾는 중…</p>
          )}

          {hasNoResult && (
            <div className="flex flex-col items-center rounded-card border border-line bg-surface px-5 py-8 text-center">
              <p className="text-card font-semibold text-ink">맞는 질문이나 사례를 찾지 못했어요</p>
              <p className="mt-1 text-body text-ink-2">다른 단어로 찾아보거나, AI에게 상황을 물어보세요.</p>
            </div>
          )}

          {shownFaqs.length > 0 && (
            <section className="flex flex-col gap-2">
              {tab === ALL_TAB && (
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-label font-semibold text-ink-2">
                    자주 묻는 질문 <span className="font-num tabular-nums">{faqItems.length}</span>
                  </h3>
                  {faqItems.length > FAQ_PREVIEW_COUNT && (
                    <button
                      type="button"
                      onClick={() => updateParams({ tab: FAQ_TAB })}
                      className="min-h-11 px-1 text-label font-semibold text-accent hover:text-accent-strong"
                    >
                      질문 모두 보기
                    </button>
                  )}
                </div>
              )}
              <FaqList key={`${topic?.key}-${q}-${tab}`} faqs={shownFaqs} onOpenReference={openReference} />
            </section>
          )}

          {tab === FAQ_TAB && !isCounting && faqItems.length === 0 && !hasNoResult && (
            <p className="rounded-card border border-line bg-surface px-5 py-6 text-center text-body text-ink-2">
              맞는 질문이 없어요. 사례·판례 탭을 확인해 보세요.
            </p>
          )}

          {showReferences && references.length > 0 && (
            <section className="flex flex-col gap-2">
              {tab === ALL_TAB && (
                <h3 className="pt-2 text-label font-semibold text-ink-2">
                  사례·판례·가이드라인 <span className="font-num tabular-nums">{referenceTotal}</span>
                </h3>
              )}
              <ul className="flex flex-col gap-3">
                {references.map((reference) => (
                  <li key={reference.id}>
                    <ReferenceCard reference={reference} onOpen={openReference} />
                  </li>
                ))}
              </ul>
              {totalPages > 1 && (
                <div className="mt-1 flex flex-col items-center gap-1">
                  <p className="font-num text-sub tabular-nums text-ink-3">
                    총 {meta.total}건 중 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, meta.total)}
                  </p>
                  <Pagination page={page} totalPages={totalPages} onChange={changePage} ariaLabel="자료 쪽 이동" />
                </div>
              )}
            </section>
          )}

          <div className="flex flex-col items-center rounded-card border border-line bg-surface px-5 py-6 text-center">
            <p className="text-card font-semibold text-ink">찾는 내용이 없나요?</p>
            <p className="mt-1 text-body text-ink-2">상황을 적어 주시면 비슷한 사례를 찾아 정리해 드려요.</p>
            <Button onClick={() => askAi(q)} className="mt-4 min-h-11 px-5">
              AI에게 물어보기
            </Button>
          </div>
        </>
      )}

      <LegalNotice />
    </div>
  );
};

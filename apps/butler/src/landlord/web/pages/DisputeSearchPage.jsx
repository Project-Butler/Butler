import { useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Button, FilterChip, Pagination, SegmentedControl } from '@butler/ui';
import { FaqList } from '../components/DisputeReference/FaqList';
import { LegalNotice } from '../components/DisputeReference/LegalNotice';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { ReferenceCard } from '../components/DisputeReference/ReferenceCard';
import { SearchBox } from '../components/DisputeReference/SearchBox';
import { useGetDisputeFaqList } from '../hooks/useGetDisputeFaqList';
import { useGetDisputeReferenceList } from '../hooks/useGetDisputeReferenceList';
import { DISPUTE_TOPICS, findTopic, REFERENCE_TYPES } from '../utils/disputeReference';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

const PAGE_SIZE = 5;
// 전체 탭에서 자료 위에 먼저 보여 줄 질문 수. 나머지는 질문 탭에서 본다.
const FAQ_PREVIEW_COUNT = 3;
// 글자를 칠 때마다 요청하지 않도록 입력이 멈추고 이만큼 지나면 검색한다.
const SEARCH_DELAY_MS = 300;

const ALL_TAB = 'ALL';
const FAQ_TAB = 'FAQ';

// 제안한 검색어 뒤의 목적격 조사: 끝 글자에 받침이 있으면 "을", 없으면 "를"("보증금을", "전세 사기를").
// 끝이 한글이 아니면(숫자·영문) 읽는 법을 몰라 "을(를)".
const objectParticle = (text) => {
  const code = text.trim().codePointAt(text.trim().length - 1);
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return '을(를)';
  return (code - 0xac00) % 28 === 0 ? '를' : '을';
};
const REFERENCE_TYPE_VALUES = REFERENCE_TYPES.map(({ value }) => value);

const sum = (values) => values.reduce((total, value) => total + value, 0);

// 자료 찾기: 검색창 하나와 상황 칩으로 자주 묻는 질문과 사례·판례·가이드라인을 함께 찾는다.
// 조건이 없으면 전체 자료를 보여 준다(상황 고르기는 첫 화면 몫이라 여기에는 타일을 두지 않는다).
// 조건(topic·q·tab)은 주소에 둬서 사례 상세에서 돌아와도 그대로 남는다.
export const DisputeSearchPage = () => {
  const { askAi, setAiSuggestions, openReference, goBack, onUnauthorized } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const topic = findTopic(searchParams.get('topic'));
  const q = searchParams.get('q') ?? '';
  const tab = searchParams.get('tab') ?? ALL_TAB;
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [keyword, setKeyword] = useState(q);
  const resultsRef = useRef(null);

  // 칩·탭·검색어·쪽은 같은 화면 안의 필터라 기록을 쌓지 않고 주소만 바꾼다(replace).
  // 그래서 [뒤로]는 칩을 몇 번 눌렀든 이 화면에 오기 전으로 가고, 사례 상세에서 돌아오면 마지막 조건이 그대로 남는다.
  // 쪽(page)을 직접 바꾸지 않는 변경은 조건이 바뀐 것이라 1쪽으로 돌아간다.
  const updateParams = (changes) =>
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
      { replace: true },
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

  // 오른쪽 AI: 검색어가 있으면 그 말로 물어볼 질문, 없으면 기본 질문
  useEffect(() => {
    setAiSuggestions?.(q ? [`'${q}' 관련해서 제 상황을 물어보고 싶어요`, `'${q}'이(가) 무슨 뜻인지 쉽게 설명해 주세요`] : null);
  }, [q, setAiSuggestions]);

  const category = topic ? topic.categories.join(',') : undefined;
  const faqs = useGetDisputeFaqList({ category, q: q || undefined });
  const list = useGetDisputeReferenceList({
    type: REFERENCE_TYPE_VALUES.includes(tab) ? tab : undefined,
    category,
    q: q || undefined,
    page,
    size: PAGE_SIZE,
  });

  useEffect(() => {
    if (isUnauthorizedError(list.error) || isUnauthorizedError(faqs.error)) onUnauthorized?.();
  }, [list.error, faqs.error, onUnauthorized]);

  const faqItems = faqs.data ?? [];
  const references = list.data?.data ?? [];
  const meta = list.data?.meta;
  const countsByType = meta?.countsByType;
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
  // 띄어 쓴 단어가 모두 들어간 자료가 없으면 서버가 일부 단어만 든 자료를 단어 많은 순으로 보내고 partialMatch로 알린다.
  const partialMatch = meta?.partialMatch;
  // 질문도 같은 규칙으로 완화한다(질문 목록은 배열이라 질문마다 같은 partialMatch가 붙어 온다).
  const faqPartialMatch = faqItems[0]?.partialMatch;
  // 오타로 보이는 단어가 있으면 서버가 고친 검색어를 제안한다(결과는 입력한 검색어 그대로). 누르면 그 말로 다시 찾는다.
  const suggestion = meta?.suggestion;
  const searchSuggestion = () => {
    setKeyword(suggestion.query);
    search(suggestion.query);
  };

  // 고른 칩을 다시 누르면 상황을 풀고 전체에서 본다.
  const selectTopic = (key) => updateParams({ topic: topic?.key === key ? null : key, tab: null });
  const changePage = (nextPage) => {
    updateParams({ page: nextPage > 1 ? String(nextPage) : null });
    resultsRef.current?.scrollIntoView?.({ block: 'start' });
  };


  return (
    <div className="flex flex-col gap-4">
      {/* 다른 메뉴 화면과 같은 제목 줄(PageHeader). [뒤로]는 앱 안에서 왔으면 이전 화면, 주소로 바로 들어왔으면 임대차 분쟁 센터로 간다. */}
      <PageHeader title="자료 찾기" onBack={goBack} />

      <SearchBox
        value={keyword}
        onChange={setKeyword}
        onSubmit={(trimmed) => trimmed !== q && search(trimmed)}
        onClear={() => {
          setKeyword('');
          updateParams({ q: null });
        }}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="상황">
        {DISPUTE_TOPICS.map((item) => (
          <FilterChip key={item.key} selected={topic?.key === item.key} onClick={() => selectTopic(item.key)}>
            {item.label}
          </FilterChip>
        ))}
      </div>

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

      {suggestion && (
        <p className="text-body text-ink-2">
          혹시{' '}
          <button
            type="button"
            onClick={searchSuggestion}
            className="min-h-11 font-semibold text-accent underline hover:text-accent-strong"
          >
            {suggestion.query}
          </button>
          {objectParticle(suggestion.query)} 찾으셨나요?
        </p>
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
          {faqPartialMatch && (
            <p role="status" className="rounded-card border border-line bg-surface-2 px-4 py-3 text-body text-ink-2">
              모든 단어가 들어간 질문이 없어서, 일부 단어만 들어간 질문을 보여 드려요. 단어가 많이 들어간 질문(
              {faqPartialMatch.termCount}개 중 최대 {faqPartialMatch.matchedTermCount}개)이 위에 있어요.
            </p>
          )}
          <FaqList key={`${topic?.key}-${q}-${tab}`} faqs={shownFaqs} onOpenReference={openReference} />
        </section>
      )}

      {tab === FAQ_TAB && !isCounting && faqItems.length === 0 && !hasNoResult && (
        <p className="rounded-card border border-line bg-surface px-5 py-6 text-center text-body text-ink-2">
          맞는 질문이 없어요. 사례·판례 탭을 확인해 보세요.
        </p>
      )}

      {showReferences && references.length > 0 && partialMatch && (
        <p role="status" className="rounded-card border border-line bg-surface-2 px-4 py-3 text-body text-ink-2">
          모든 단어가 들어간 자료가 없어서, 일부 단어만 들어간 자료를 보여 드려요. 단어가 많이 들어간 자료(
          {partialMatch.termCount}개 중 최대 {partialMatch.matchedTermCount}개)가 위에 있어요.
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

      <LegalNotice />
    </div>
  );
};

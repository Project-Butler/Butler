import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, FileCheck2, Scale, Search } from 'lucide-react';
import { Button } from '@butler/ui';
import { HelpRouteCard } from './HelpRouteCard';
import { ReferenceCard } from './ReferenceCard';
import { SelfCheckTools } from './SelfCheckTools';

// 상황 안내의 '끝까지 보는' 구성: 먼저 확인 → 내 경우 → 준비 자료 → 사례 → 판례 → 절차 → 도움받을 곳 → 도구 → AI.
// 여섯 상황 모두 같은 구조(TOPIC_BRIEFINGS[].guide)를 쓴다.
const SECTIONS = [
  { id: 'guide-checks', label: '먼저 확인' },
  { id: 'guide-cases', label: '내 경우' },
  { id: 'guide-documents', label: '준비 자료' },
  { id: 'guide-references', label: '사례·판례' },
  { id: 'guide-procedure', label: '절차' },
  { id: 'guide-help', label: '도움받을 곳' },
  { id: 'guide-tools', label: '서식·도구' },
];

const Section = ({ id, title, children }) => (
  <section id={id} className="flex scroll-mt-16 flex-col gap-3">
    <h3 className="text-section font-semibold text-ink">{title}</h3>
    {children}
  </section>
);

// 문장 아래 [근거 보기]: 근거 조문·판례와 적용 조건을 펼치고, 관련 판례 검색으로 잇는다.
// 화면 문장이 짧게 일반화되어 있어서, 왜 그렇게 썼는지와 언제 달라지는지를 바로 확인할 수 있게 한다.
const BasisToggle = ({ item, onSearchPrecedent }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex min-h-9 items-center gap-0.5 text-sub font-semibold text-ink-3 hover:text-ink"
      >
        근거 보기
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <dl className="mt-1 flex flex-col gap-1.5 rounded-input bg-surface-2 px-3 py-2.5 text-sub">
          <div>
            <dt className="font-semibold text-ink-2">근거</dt>
            <dd className="break-keep text-ink">{item.basis}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-2">적용 조건</dt>
            <dd className="break-keep text-ink">{item.condition}</dd>
          </div>
          <dd>
            <button
              type="button"
              onClick={() => onSearchPrecedent(item.precedentQ ?? item.q)}
              className="flex min-h-9 items-center gap-0.5 font-semibold text-accent hover:text-accent-strong"
            >
              관련 판례 찾기
              <ChevronRight size={14} />
            </button>
          </dd>
        </dl>
      )}
    </div>
  );
};

// precedents: [{ reference, question }] — 자주 묻는 질문의 근거 판례와 그 질문(왜 관련 있는지)
export const TopicGuide = ({ guide, helpRoutes, cases, precedents, onSearch, onSearchPrecedent, onOpenReference, onAsk }) => {
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

  return (
    <>
      {/* 긴 안내라 맨 위에 목차를 두고, 필요한 칸으로 바로 건너뛰게 한다. */}
      <nav aria-label="안내 목차" className="flex gap-1.5 overflow-x-auto border-b border-line pb-2">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollTo(section.id)}
            className="min-h-9 shrink-0 rounded-full border border-line bg-surface px-3 text-sub text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {section.label}
          </button>
        ))}
      </nav>

      {/* 근거를 펼친 카드만 늘어나도록 옆 카드와 높이를 맞추지 않는다(items-start). */}
      <Section id="guide-checks" title="먼저 확인하세요">
        <ul className="grid items-start gap-3 sm:grid-cols-2">
          {guide.checks.map((check) => (
            <li key={check.label} className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
              <CheckCircle2 size={20} className="shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">{check.label}</p>
                <p className="mt-0.5 break-keep text-sub text-ink-2">{check.detail}</p>
                <BasisToggle item={check} onSearchPrecedent={onSearchPrecedent} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="guide-cases" title="내 경우에는">
        <ul className="grid items-start gap-3 sm:grid-cols-2">
          {guide.cases.map((item) => (
            <li key={item.key} className="flex flex-col rounded-card border border-line bg-surface p-4 lg:p-5">
              <p className="text-card font-semibold text-ink">{item.title}</p>
              <p className="mt-2 break-keep text-body text-ink-2">{item.action}</p>
              <BasisToggle item={item} onSearchPrecedent={onSearchPrecedent} />
              <button
                type="button"
                onClick={() => onSearch(item.q)}
                className="mt-3 flex min-h-11 items-center gap-0.5 self-start text-label font-semibold text-accent hover:text-accent-strong"
              >
                비슷한 사례 보기
                <ChevronRight size={16} />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="guide-documents" title="지금 준비할 자료">
        <ul className="grid gap-x-6 gap-y-2 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:p-5">
          {guide.documents.map((document) => (
            <li key={document} className="flex items-center gap-2 text-body text-ink">
              <FileCheck2 size={16} className="shrink-0 text-accent" />
              {document}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="guide-references" title="실제 조정 사례">
        <ul className="flex flex-col gap-3">
          {cases.map((reference) => (
            <li key={reference.id}>
              <ReferenceCard reference={reference} onOpen={onOpenReference} />
            </li>
          ))}
        </ul>
      </Section>

      {precedents.length > 0 && (
        <Section title="관련 판례">
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {precedents.map(({ reference, question }) => (
              <li key={reference.id}>
                <button
                  type="button"
                  onClick={() => onOpenReference(reference.id)}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 lg:px-5"
                >
                  <Scale size={18} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-ink">{reference.title}</span>
                    <span className="mt-0.5 block text-sub text-ink-2">이런 질문의 근거예요 · {question}</span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-ink-3" />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="guide-procedure" title="해결 절차">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {guide.procedure.map((step, i) => (
            <li key={step.title} className="rounded-card border border-line bg-surface p-4">
              <span className="font-num text-chip font-semibold tabular-nums text-accent-strong">{i + 1}단계</span>
              <p className="mt-1 text-card font-semibold text-ink">{step.title}</p>
              <p className="mt-1 break-keep text-sub text-ink-2">{step.detail}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="guide-help" title="어디에 도움을 요청해야 하나요?">
        <ul className="grid gap-3">
          {helpRoutes.map((route) => (
            <li key={route.key}>
              <HelpRouteCard route={route} />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="guide-tools" title="서식·도구">
        <SelfCheckTools tools={guide.tools} />
      </Section>

      {onAsk && (
        <section className="flex flex-col items-center rounded-card border border-line bg-surface px-5 py-6 text-center">
          <Search size={20} className="text-accent" />
          <p className="mt-2 text-card font-semibold text-ink">그래도 내 상황이 애매하다면</p>
          <p className="mt-1 text-body text-ink-2">상황을 적어 주시면 관련 사례·판례와 도움받을 곳을 찾아 정리해 드려요.</p>
          <Button onClick={onAsk} className="mt-4 min-h-11 px-5">
            내 상황으로 찾아보기
          </Button>
        </section>
      )}
    </>
  );
};

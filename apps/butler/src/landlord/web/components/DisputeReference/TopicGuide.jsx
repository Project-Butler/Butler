import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, FileCheck2, Scale, Search } from 'lucide-react';
import { Button } from '@butler/ui';
import { HelpRouteCard } from './HelpRouteCard';
import { ReferenceCard } from './ReferenceCard';
import { SelfCheckTools } from './SelfCheckTools';

// 상황 안내는 GOV.UK 'step by step'처럼 번호 단계로 보여 준다. 처음엔 단계 제목만 보이고, 펼치면 그 단계의 설명과
// 그 단계에서 쓰는 자료(확인할 것·내 경우·준비 자료·사례·판례)·서식·기관이 나온다. 1단계는 '지금 상황 확인'(checks·cases),
// 2~5단계는 guide.procedure(단계마다 parts·tools·help). 여섯 상황 모두 같은 구조(TOPIC_BRIEFINGS[].guide)를 쓴다.
const FIRST_STEP = { title: '지금 상황 확인', detail: '아래를 먼저 확인하고, 내 경우에 맞는 안내를 보세요.', parts: ['checks', 'cases'] };

const Part = ({ title, children }) => (
  <div className="flex flex-col gap-2">
    <h4 className="text-label font-semibold text-ink-2">{title}</h4>
    {children}
  </div>
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
  const steps = [FIRST_STEP, ...guide.procedure];
  const [openSteps, setOpenSteps] = useState(() => new Set());
  const isAllOpen = openSteps.size === steps.length;
  const toggleStep = (index) =>
    setOpenSteps((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const toggleAll = () => setOpenSteps(isAllOpen ? new Set() : new Set(steps.map((_, i) => i)));

  const renderPart = (part) => {
    switch (part) {
      case 'checks':
        // 근거를 펼친 카드만 늘어나도록 옆 카드와 높이를 맞추지 않는다(items-start).
        return (
          <Part key={part} title="먼저 확인하세요">
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
          </Part>
        );
      case 'cases':
        return (
          <Part key={part} title="내 경우에는">
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
          </Part>
        );
      case 'documents':
        return (
          <Part key={part} title="준비할 자료">
            <ul className="grid gap-x-6 gap-y-2 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:p-5">
              {guide.documents.map((document) => (
                <li key={document} className="flex items-center gap-2 text-body text-ink">
                  <FileCheck2 size={16} className="shrink-0 text-accent" />
                  {document}
                </li>
              ))}
            </ul>
          </Part>
        );
      case 'caseRefs':
        return cases.length > 0 ? (
          <Part key={part} title="비슷한 조정 사례">
            <ul className="flex flex-col gap-3">
              {cases.map((reference) => (
                <li key={reference.id}>
                  <ReferenceCard reference={reference} onOpen={onOpenReference} />
                </li>
              ))}
            </ul>
          </Part>
        ) : null;
      case 'precedents':
        return precedents.length > 0 ? (
          <Part key={part} title="관련 판례">
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
          </Part>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <>
      <section className="flex flex-col gap-3" aria-label="해결 단계">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-section font-semibold text-ink">해결 단계</h3>
          <button
            type="button"
            onClick={toggleAll}
            className="flex min-h-11 items-center gap-0.5 px-1 text-label font-semibold text-accent hover:text-accent-strong"
          >
            {isAllOpen ? '모두 접기' : '모두 펼치기'}
          </button>
        </div>

        {/* 번호와 세로선으로 순서를 보여 준다. 마지막 단계 아래로는 선을 긋지 않는다. */}
        <ol className="flex flex-col">
          {steps.map((step, index) => {
            const isOpen = openSteps.has(index);
            const isLast = index === steps.length - 1;
            const stepTools = guide.tools.filter((tool) => step.tools?.includes(tool.key));
            const stepRoutes = helpRoutes.filter((route) => step.help?.includes(route.key));
            const panelId = `guide-step-${index + 1}`;
            return (
              <li key={step.title} className="relative flex gap-3 pb-2">
                {!isLast && <span aria-hidden className="absolute bottom-0 left-4 top-9 w-px bg-line" />}
                <span className="relative z-10 mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent bg-surface font-num text-label font-semibold tabular-nums text-accent-strong">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleStep(index)}
                    className="flex min-h-11 w-full items-center gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1 break-keep text-card font-semibold text-ink">{step.title}</span>
                    <span className="flex shrink-0 items-center gap-0.5 text-sub font-semibold text-ink-3">
                      {isOpen ? '접기' : '펼치기'}
                      <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  {isOpen && (
                    <div id={panelId} className="flex flex-col gap-4 pb-4 pt-1">
                      <p className="break-keep text-body text-ink-2">{step.detail}</p>
                      {step.parts?.map(renderPart)}
                      {stepTools.length > 0 && (
                        <Part title="서식·도구">
                          <SelfCheckTools tools={stepTools} />
                        </Part>
                      )}
                      {stepRoutes.length > 0 && (
                        <Part title="도움받을 곳">
                          <ul className="grid gap-3">
                            {stepRoutes.map((route) => (
                              <li key={route.key}>
                                <HelpRouteCard route={route} />
                              </li>
                            ))}
                          </ul>
                        </Part>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {onAsk && (
        <section className="flex flex-col items-center rounded-card border border-line bg-surface px-5 py-6 text-center">
          <Search size={20} className="text-accent" />
          <p className="mt-2 text-card font-semibold text-ink">답을 찾지 못하셨나요?</p>
          <p className="mt-1 text-body text-ink-2">상황을 적어 주시면 관련 사례·판례와 도움받을 곳을 찾아 정리해 드려요.</p>
          <Button onClick={onAsk} className="mt-4 min-h-11 px-5">
            AI에게 물어보기
          </Button>
        </section>
      )}
    </>
  );
};

import { Check, Search, X } from 'lucide-react';

// 체크 칸 하나(여러 개 고르기). 누르는 칸 40px 이상, 글자 15px.
const OptionCheck = ({ label, checked, onToggle }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    onClick={onToggle}
    className={`inline-flex min-h-10 w-36 items-center gap-2 rounded-input px-2 text-left text-card-sm hover:bg-surface-2 ${
      checked ? 'font-semibold text-accent-strong' : 'text-ink'
    }`}
  >
    <span
      aria-hidden="true"
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border ${
        checked ? 'border-accent bg-accent text-white' : 'border-line bg-surface'
      }`}
    >
      {checked && <Check size={13} strokeWidth={3} />}
    </span>
    {label}
  </button>
);

// 왼쪽 회색 이름 칸 + 오른쪽 고를 것. 수리 요청 거르기 카드도 같은 줄을 쓴다.
export const FilterRow = ({ label, children }) => (
  <div className="grid grid-cols-[132px_1fr] border-b border-line last:border-b-0">
    <div className="flex items-center bg-surface-2 px-5 py-3 text-card-sm font-semibold text-ink">{label}</div>
    <div className="flex min-w-0 flex-wrap items-center gap-2 px-4 py-2">{children}</div>
  </div>
);

// 체크 줄: 맨 앞 '전체' + options. 아무것도 안 고르면 '전체'에 체크, '전체'를 누르면 그 줄이 풀린다.
export const CheckRow = ({ label, options, values, onChange }) => {
  const toggle = (value) => onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  return (
    <FilterRow label={label}>
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1">
        <OptionCheck label="전체" checked={values.length === 0} onToggle={() => onChange([])} />
        {options.map((option) => (
          <OptionCheck key={option.value} label={option.label} checked={values.includes(option.value)} onToggle={() => toggle(option.value)} />
        ))}
      </div>
    </FilterRow>
  );
};

export const MAX_QUERY_LENGTH = 50;

// 하우스 로그 거르기 카드(시안 E, U-05). 4줄: 검색 · 호실 · 유형 · 방. [초기화] 버튼은 두지 않는다.
// - query: 검색창 글자(그대로). 보낼 값(앞뒤 공백 빼기·늦춰 보내기)은 쓰는 쪽이 정한다.
// - propertyField: 호실 줄에 넣을 고르기 칸(지금 쓰는 드롭다운).
// - types·rooms: 고른 값 배열. 빈 배열 = 전체.
export const LogFilterCard = ({ query, onQueryChange, propertyField, typeOptions, types, onTypesChange, roomOptions, rooms, onRoomsChange }) => (
  <section aria-label="기록 찾기" className="overflow-hidden rounded-card border border-line bg-surface">
    <FilterRow label="검색">
      <label className="flex h-12 w-full max-w-[560px] items-center gap-2 rounded-input border border-line bg-surface px-3 focus-within:border-accent">
        <Search size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
        <input
          type="search"
          aria-label="검색"
          value={query}
          maxLength={MAX_QUERY_LENGTH}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="제목이나 내용에 들어간 말을 입력하세요 (예: 보일러, 누수)"
          className="min-w-0 flex-1 bg-transparent text-card-sm text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => onQueryChange('')}
            className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </label>
    </FilterRow>
    <FilterRow label="호실">{propertyField}</FilterRow>
    <CheckRow label="유형" options={typeOptions} values={types} onChange={onTypesChange} />
    <CheckRow label="방" options={roomOptions} values={rooms} onChange={onRoomsChange} />
  </section>
);

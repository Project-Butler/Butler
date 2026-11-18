import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { TextField } from '../TextField/TextField';
import { CUSTOM_DOMAIN, EMAIL_DOMAINS } from './useRegisterForm';

const optionClass =
  'flex cursor-pointer items-center justify-between gap-2 rounded-chip px-3 py-2 text-body text-ink data-[focus]:bg-accent-soft data-[selected]:font-semibold data-[selected]:text-accent-strong';
const pillClass = 'flex h-8 min-w-0 flex-1 items-center rounded-chip bg-accent-soft text-body font-semibold text-accent-strong';

// 가입 이메일 칸. @ 앞만 입력하고, 칸 오른쪽 브랜드색 영역에서 @ 는 제자리에 두고 그 옆 도메인만 목록에서 고른다.
// "직접 입력"을 고르면 같은 자리가 입력칸으로 바뀐다(칸이 새로 생기지 않는다).
// 브라우저가 이전에 입력한 이메일을 자동완성 목록으로 보여 주지 않도록 type="email"·autoComplete 를 쓰지 않는다.
//  email: useRegisterForm 이 돌려주는 email 객체
//  className 은 바깥 묶음에 붙는다. 나머지 props 는 TextField 로 그대로 넘긴다(error, mobile, aria-* 등).
export const EmailField = ({ email, mobile = false, className = '', ...fieldProps }) => {
  const isVerified = email.step === 'verified';
  const isCustom = email.domainChoice === CUSTOM_DOMAIN;
  const domain = isCustom ? email.customDomain : email.domainChoice;
  const customInputRef = useRef(null);

  // 직접 입력을 고르면 바로 쓸 수 있게 입력칸으로 커서를 옮긴다(목록이 닫히며 버튼으로 돌아가는 포커스보다 뒤에).
  useEffect(() => {
    if (!isCustom) return undefined;
    const timer = setTimeout(() => customInputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isCustom]);

  const chevron = <ChevronDown size={16} strokeWidth={2.25} aria-hidden="true" />;

  const options = (
    <ListboxOptions className="absolute right-0 top-[calc(100%+10px)] z-30 max-h-64 w-44 overflow-y-auto rounded-input border border-line bg-surface p-1 shadow-lg outline-none">
      {EMAIL_DOMAINS.map((item) => (
        <ListboxOption key={item} value={item} className={optionClass}>
          {({ selected }) => (
            <>
              <span className="truncate">{item}</span>
              {selected && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
            </>
          )}
        </ListboxOption>
      ))}
      <ListboxOption value={CUSTOM_DOMAIN} className={optionClass}>
        {({ selected }) => (
          <>
            <span>직접 입력</span>
            {selected && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
          </>
        )}
      </ListboxOption>
    </ListboxOptions>
  );

  const domainPicker = (
    <Listbox value={email.domainChoice} onChange={email.onDomainChange}>
      <div className="relative flex min-w-0 flex-1">
        {isCustom ? (
          <div className={`${pillClass} focus-within:ring-2 focus-within:ring-accent`}>
            <input
              ref={customInputRef}
              aria-label="이메일 도메인 직접 입력"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="example.com"
              value={email.customDomain}
              onChange={(event) => email.onCustomDomainChange(event.target.value)}
              className="min-w-0 flex-1 bg-transparent pl-2.5 outline-none placeholder:font-normal placeholder:text-accent/60"
            />
            <ListboxButton
              aria-label="이메일 도메인"
              className="flex h-full shrink-0 items-center rounded-r-chip pl-1 pr-2 outline-none hover:bg-accent hover:text-white focus-visible:bg-accent focus-visible:text-white"
            >
              {chevron}
            </ListboxButton>
          </div>
        ) : (
          <ListboxButton
            aria-label="이메일 도메인"
            className={`${pillClass} justify-between gap-1 pl-2.5 pr-2 outline-none transition-colors hover:bg-accent hover:text-white focus-visible:ring-2 focus-visible:ring-accent data-[open]:bg-accent data-[open]:text-white`}
          >
            <span className={`truncate ${domain ? '' : 'font-normal'}`}>{domain || '선택'}</span>
            {chevron}
          </ListboxButton>
        )}
        {options}
      </div>
    </Listbox>
  );

  // @ 는 고정 폭 영역(목록에서 가장 긴 도메인이 들어가는 만큼)의 왼쪽 끝에 둬서 도메인 글자 길이와 상관없이 같은 자리에 있다.
  // 인증이 끝난 뒤에는 도메인 + "인증 완료"가 다 보이도록 폭을 고정하지 않는다.
  const suffix = (
    <span className={`flex items-center gap-2 ${isVerified ? '' : 'w-36'}`}>
      <span aria-hidden="true" className="shrink-0 font-bold text-accent">
        @
      </span>
      {isVerified ? (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {domain && <span className="min-w-0 truncate rounded-chip bg-accent-soft px-2.5 py-1 font-semibold text-accent-strong">{domain}</span>}
          <span className="shrink-0 font-semibold text-accent-strong">인증 완료</span>
        </span>
      ) : (
        domainPicker
      )}
    </span>
  );

  return (
    <div className={className}>
      <TextField
        {...fieldProps}
        mobile={mobile}
        label="이메일"
        required
        type="text"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="아이디"
        value={email.local}
        onChange={(event) => email.onLocalChange(event.target.value)}
        disabled={isVerified}
        suffix={suffix}
      />
    </div>
  );
};

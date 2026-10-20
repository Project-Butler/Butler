import { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Badge, Button, TextField } from '@butler/ui';
import { useGetComplexSearchList } from '../../hooks/useGetComplexSearchList';
import { usePostComplexResolve } from '../../hooks/usePostComplexResolve';
import { formatDetailBuildingRange } from '../../utils/detailBuildingNames';
import { NoticeBox } from '../NoticeBox/NoticeBox';

// 서버 검증(apps/api complexes controller)과 같은 범위
const MIN_QUERY_LENGTH = 2;
const SEARCH_SIZE = 20;

// 주소 검색 창. juso 결과를 거르지 않고 그대로 보여 준다(상가 등 공동주택이 아닌 주소도).
// 검색은 엔터·[검색] 버튼 때만. 줄을 고르면 바로 resolve(검색 응답의 sourceKey 그대로)하고 onResolved(complex)를 부른다.
export const AddressSearchDialog = ({ initialQuery = '', onResolved, onClose, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const search = useGetComplexSearchList(hookOptions);
  const resolve = usePostComplexResolve(hookOptions);
  const [query, setQuery] = useState(initialQuery);
  const [queryError, setQueryError] = useState('');
  const [resolvingKey, setResolvingKey] = useState(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSearch = async (event) => {
    event.preventDefault();
    const keyword = query.trim();
    if (keyword.length < MIN_QUERY_LENGTH) {
      setQueryError(`${MIN_QUERY_LENGTH}자 이상 입력해 주세요.`);
      return;
    }
    setQueryError('');
    resolve.reset();
    await search.searchComplexes({ query: keyword, size: SEARCH_SIZE });
  };

  const handleSelect = async (item) => {
    if (resolve.isLoading) return;
    setResolvingKey(item.sourceKey);
    const { data } = await resolve.resolveComplex({ sourceKey: item.sourceKey });
    setResolvingKey(null);
    if (data) onResolved(data);
  };

  const results = search.data;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-search-title"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-card bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="address-search-title" className="text-section font-semibold text-ink">
            주소 검색
          </h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-input text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSearch} className="mt-4 flex items-start gap-2">
          <TextField
            className="flex-1"
            aria-label="주소 검색어"
            placeholder="도로명, 건물명, 지번으로 검색 (예: 중계그린)"
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (queryError) setQueryError('');
            }}
            error={queryError}
            disabled={resolve.isLoading}
          />
          <Button type="submit" variant="secondary" className="h-12 shrink-0" disabled={search.isLoading || resolve.isLoading}>
            <Search size={16} className="-ml-0.5 mr-1.5 inline-block" />
            {search.isLoading ? '검색 중' : '검색'}
          </Button>
        </form>

        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {search.error && <NoticeBox>{search.error.message}</NoticeBox>}
          {resolve.error && <NoticeBox>{resolve.error.message}</NoticeBox>}

          {results && results.length === 0 && (
            <p className="rounded-input bg-surface-2 px-4 py-3 text-body text-ink-2">
              검색 결과가 없습니다. 도로명주소나 건물명을 다시 확인해 주세요.
            </p>
          )}

          {results?.length > 0 && (
            <ul className="space-y-2">
              {results.map((item) => {
                const dongRange = formatDetailBuildingRange(item.detailBuildingNames);
                return (
                  <li key={item.sourceKey}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item)}
                      disabled={resolve.isLoading}
                      className="flex w-full items-center justify-between gap-3 rounded-btn border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-accent hover:bg-surface-2 disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:bg-surface"
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-card font-semibold text-ink">{item.name}</span>
                          {!item.isApartment && <Badge>공동주택 아님</Badge>}
                          {item.kapt?.saleType && <Badge>{item.kapt.saleType}</Badge>}
                        </span>
                        {item.roadAddress && <span className="mt-0.5 block text-sub text-ink-2">도로명 {item.roadAddress}</span>}
                        {item.jibunAddress && <span className="block text-sub text-ink-3">지번 {item.jibunAddress}</span>}
                        <span className="block font-num text-sub tabular-nums text-ink-3">
                          {[item.zipCode && `우편번호 ${item.zipCode}`, dongRange].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {resolvingKey === item.sourceKey && (
                        <span role="status" aria-label="주소 정보를 불러오는 중" className="shrink-0">
                          <Loader2 size={18} className="animate-spin text-accent" aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

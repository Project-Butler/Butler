import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, FilterChip, Pagination, SegmentedControl } from '@butler/ui';
import { Search } from 'lucide-react';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import { UserTable } from '../components/UserTable/UserTable';
import { ROLE_LABEL, USER_STATUS_LABEL } from '../constants/labels';
import { useGetAdminUserList } from '../hooks/useGetAdminUserList';

const PAGE_SIZE = 20;
const ROLE_OPTIONS = ['LANDLORD', 'TENANT', 'ADMIN'];
const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  ...['ACTIVE', 'SUSPENDED', 'WITHDRAWN'].map((value) => ({ value, label: USER_STATUS_LABEL[value] })),
];

// 회원 목록. 검색어·필터·쪽 번호는 URL 쿼리에 둬서, 상세에 갔다가 뒤로 와도 그대로 남는다.
export const UserListPage = ({ onNavigate, onUnauthorized }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('query') ?? '';
  const role = searchParams.get('role') ?? '';
  const status = searchParams.get('status') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [keyword, setKeyword] = useState(query);

  const { data, error, isLoading, refetch } = useGetAdminUserList(
    { query: query || undefined, role: role || undefined, status: status || undefined, page, size: PAGE_SIZE },
    { onUnauthorized },
  );

  // 필터가 바뀌면 1쪽으로 돌아간다. 빈 값은 URL에서 뺀다.
  const updateParams = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries({ page: undefined, ...changes }).forEach(([key, value]) => {
      if (value) next.set(key, String(value));
      else next.delete(key);
    });
    setSearchParams(next);
  };

  const handleSearch = (event) => {
    event.preventDefault();
    updateParams({ query: keyword.trim() });
  };

  const totalPages = data ? Math.ceil(data.meta.total / data.meta.size) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-h1 font-bold text-ink">회원 관리</h2>
          <p className="mt-1 text-body text-ink-2">이메일·이름으로 찾고, 회원을 눌러 정지·해제할 수 있습니다.</p>
        </div>
        {data && <span className="font-num text-body text-ink-3">총 {data.meta.total.toLocaleString('ko-KR')}명</span>}
      </div>

      <Card className="space-y-4 p-5">
        <form onSubmit={handleSearch} className="flex gap-2" role="search">
          <label className="flex h-11 flex-1 items-center gap-2 rounded-input border border-line bg-surface px-3.5 focus-within:border-accent">
            <Search size={18} className="text-ink-3" aria-hidden="true" />
            <span className="sr-only">이메일 또는 이름</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="이메일 또는 이름"
              maxLength={100}
              className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-ink-3"
            />
          </label>
          <Button type="submit" variant="primary">
            검색
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="역할">
            {ROLE_OPTIONS.map((value) => (
              <FilterChip key={value} selected={role === value} onClick={() => updateParams({ role: role === value ? '' : value })}>
                {ROLE_LABEL[value]}
              </FilterChip>
            ))}
          </div>
          <SegmentedControl
            ariaLabel="상태"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(value) => updateParams({ status: value })}
            className="w-80"
          />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {error && (
          <StatusMessage tone="error" onRetry={refetch}>
            {error.message}
          </StatusMessage>
        )}
        {isLoading && !data && <StatusMessage>불러오는 중입니다</StatusMessage>}
        {data && data.items.length === 0 && <StatusMessage>조건에 맞는 회원이 없습니다.</StatusMessage>}
        {data && data.items.length > 0 && (
          <div className={isLoading ? 'opacity-60' : undefined}>
            <UserTable users={data.items} onSelect={(user) => onNavigate('userDetail', { userId: user.id })} />
          </div>
        )}
      </Card>

      <Pagination page={page} totalPages={totalPages} onChange={(next) => updateParams({ page: next })} />
    </div>
  );
};

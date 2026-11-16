import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, SegmentedControl } from '@butler/ui';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useGetContractList } from '../../web/hooks/useGetContractList';
import { useGetPropertyList } from '../../web/hooks/useGetPropertyList';
import searchIcon from '../assets/icon-search.svg';
import { AppTabShell } from '../components/AppTabShell/AppTabShell';
import { countSegments, filterAssets, SEGMENTS, toAssetCards } from '../utils/assets';
import { useGoTo } from '../utils/navigation';

// 홈과 같은 크기(목록 API 최대 100건)로 한 번에 받는다. 넘으면 앞 100건만 보인다(페이지 나누기는 후속).
const LIST_SIZE = 100;
const CARD_CLASS = 'rounded-card border border-line bg-surface';

const AssetCard = ({ card, onOpen, onVerify }) => (
  <li className={`${CARD_CLASS} overflow-hidden`}>
    <button type="button" onClick={onOpen} className="flex w-full flex-col gap-1 px-4 pb-3 pt-4 text-left">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-m-card font-semibold text-ink">{card.title}</span>
        <Badge mobile tone={card.verification.tone} className="shrink-0">
          {card.verification.tone === 'verified' ? `✓ ${card.verification.label}` : card.verification.label}
        </Badge>
      </span>
      {card.spec && <span className="text-m-sub text-ink-3">{card.spec}</span>}
      <span className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="min-w-0 truncate text-m-label text-ink-2">{card.tenantLine}</span>
        {card.depositLabel && (
          <span className="shrink-0 font-num text-num-body font-semibold tabular-nums text-ink">{card.depositLabel}</span>
        )}
      </span>
    </button>
    {card.verifyLabel && (
      <div className="px-4 pb-4">
        <Button variant="verifyOutline" size="h44" className="w-full" onClick={onVerify}>
          {card.verifyLabel}
        </Button>
      </div>
    )}
  </li>
);

// 임대인 앱 내 자산 (Figma M05). 웹 내 부동산과 같은 호실 목록 API에, 홈과 같은 계약 목록을 붙여 임차인·보증금을 보여 준다.
// 반려 칩·반려 사유는 API에 없어 두지 않는다(인증 상태 4가지만). 등록 직후 안내(history state notice)는 한 번만 보여 준다.
// topBar: 홈형 상단 바 props(아바타 등). 라우트가 넘긴다.
export const BuildingListPage = ({ topBar, onUnauthorized }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const goTo = useGoTo();
  const [notice] = useState(() => location.state?.notice ?? null);
  useEffect(() => {
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState(SEGMENTS.ALL);

  const hookOptions = { onUnauthorized };
  const properties = useGetPropertyList({ relation: 'OWNER', size: LIST_SIZE }, hookOptions);
  const contracts = useGetContractList(
    { status: 'UPCOMING,ACTIVE,EXPIRING_SOON', sort: 'endDate:asc', size: LIST_SIZE, activeOwnership: 'true' },
    hookOptions,
  );

  const cards = properties.data ? toAssetCards(properties.data.items, contracts.data?.items ?? []) : [];
  const counts = countSegments(cards);
  const visible = filterAssets(cards, { query, segment });
  const goRegister = () => goTo('propertyRegister');

  return (
    <AppTabShell topBar={topBar}>
      <div className="flex flex-col gap-3.5">
        {notice && (
          <p role="status" className="rounded-input bg-accent-soft px-4 py-3 text-body font-medium text-accent-strong">
            {notice}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <h1 className="text-page-sm font-bold text-ink">내 자산</h1>
          <Button size="h44" onClick={goRegister}>
            + 등록
          </Button>
        </div>

        <label className="flex h-12 items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-accent">
          <input
            type="search"
            aria-label="주소·단지명 검색"
            placeholder="주소·단지명 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
          />
          <img src={searchIcon} alt="" width={18} height={18} />
        </label>

        <SegmentedControl
          ariaLabel="계약 상태"
          value={segment}
          onChange={setSegment}
          options={[
            { value: SEGMENTS.ALL, label: '전체', count: counts[SEGMENTS.ALL] },
            { value: SEGMENTS.LEASED, label: '계약 중', count: counts[SEGMENTS.LEASED] },
            { value: SEGMENTS.VACANT, label: '공실', count: counts[SEGMENTS.VACANT] },
          ]}
        />

        {properties.error && <NoticeBox>{properties.error.message}</NoticeBox>}
        {contracts.error && <NoticeBox>{contracts.error.message}</NoticeBox>}
        {!properties.data && !properties.error && (
          <p role="status" className="py-10 text-center text-body text-ink-3">
            불러오는 중입니다
          </p>
        )}

        {properties.data && cards.length === 0 && (
          <section aria-label="부동산 없음" className={`${CARD_CLASS} flex flex-col items-center gap-3 px-5 py-12 text-center`}>
            <p className="text-m-card font-semibold text-ink">등록한 부동산이 없어요</p>
            <p className="text-body text-ink-2">주소와 동·호를 입력해 첫 부동산을 등록해 보세요.</p>
            <Button size="h44" onClick={goRegister}>
              부동산 등록
            </Button>
          </section>
        )}

        {cards.length > 0 && visible.length === 0 && (
          <p className="py-10 text-center text-body text-ink-3">조건에 맞는 부동산이 없어요</p>
        )}

        {visible.length > 0 && (
          <ul aria-label="부동산 목록" className="flex flex-col gap-2.5">
            {visible.map((card) => (
              <AssetCard
                key={card.id}
                card={card}
                onOpen={() => goTo('propertyDetail', { propertyId: card.id })}
                onVerify={() => goTo('propertyVerify', { propertyId: card.id })}
              />
            ))}
          </ul>
        )}
      </div>
    </AppTabShell>
  );
};

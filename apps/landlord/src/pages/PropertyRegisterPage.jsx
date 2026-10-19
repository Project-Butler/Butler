import { useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Badge, Button, Card, TextField } from '@butler/ui';
import { BottomActionBar } from '../components/BottomActionBar/BottomActionBar';
import { LeaseInfoStepPlaceholder } from '../components/LeaseInfoStepPlaceholder/LeaseInfoStepPlaceholder';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetComplexSearchList } from '../hooks/useGetComplexSearchList';
import { useGetComplexUnitInfo } from '../hooks/useGetComplexUnitInfo';
import { usePostComplexResolve } from '../hooks/usePostComplexResolve';
import { usePostProperty } from '../hooks/usePostProperty';
import { toFieldErrors } from '../utils/apiError';
import { formatNumber } from '../utils/format';
import {
  toAreaInput,
  toFloorInput,
  toPriceDigits,
  toYearMonthInput,
  validateAcquiredYearMonth,
  validateExclusiveArea,
  validateFloor,
  validatePurchasePrice,
} from '../utils/formValidation';
import { formatDisplayName, normalizeBuildingNo, normalizeUnitNo } from '../utils/unitAddress';

// 서버 검증(apps/api complexes·properties controller)과 같은 범위
const MIN_QUERY_LENGTH = 2;
const SEARCH_SIZE = 20;
const MAX_UNIT_PART_LENGTH = 10;

const EMPTY_FORM = { buildingNo: '', unitNo: '', exclusiveArea: '', floor: '', acquiredYearMonth: '', purchasePrice: '' };
const FORM_FIELDS = Object.keys(EMPTY_FORM);

const UNIT_INFO_MISSING_MESSAGE = '정보를 찾지 못했어요. 직접 입력해 주세요';

const validateUnitPart = (value, normalize) => {
  if (!value.trim()) return undefined;
  const length = normalize(value).length;
  return length < 1 || length > MAX_UNIT_PART_LENGTH ? `1~${MAX_UNIT_PART_LENGTH}자로 입력해 주세요.` : undefined;
};

// 입력 중인 값의 형식 오류(빈 칸은 검사하지 않음 — 필수 여부는 등록 버튼 활성으로 표시)
const validateForm = (form) => {
  const errors = {
    buildingNo: validateUnitPart(form.buildingNo, normalizeBuildingNo),
    unitNo: validateUnitPart(form.unitNo, normalizeUnitNo),
    exclusiveArea: validateExclusiveArea(form.exclusiveArea),
    floor: validateFloor(form.floor),
    acquiredYearMonth: validateAcquiredYearMonth(form.acquiredYearMonth),
    purchasePrice: validatePurchasePrice(form.purchasePrice),
  };
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
};

// 서버로 보낼 바디. 선택 값은 입력했을 때만 넣는다.
const toCreateBody = (complexId, form) => {
  const body = { complexId, buildingNo: form.buildingNo.trim(), unitNo: form.unitNo.trim() };
  if (form.exclusiveArea) body.exclusiveArea = Number(form.exclusiveArea);
  if (form.floor) body.floor = Number(form.floor);
  if (form.acquiredYearMonth) body.acquiredYearMonth = form.acquiredYearMonth;
  if (form.purchasePrice) body.purchasePrice = Number(form.purchasePrice);
  return body;
};

const ComplexSummary = ({ complex, onChange, disabled }) => {
  const { buildingInfo } = complex;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-card font-semibold text-ink">{complex.name}</p>
          <p className="mt-0.5 text-sub text-ink-2">{complex.region.fullName}</p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={onChange} disabled={disabled}>
          다시 검색
        </Button>
      </div>
      <dl className="grid grid-cols-4 gap-x-3 gap-y-1.5 text-body">
        <dt className="text-ink-3">도로명</dt>
        <dd className="col-span-3 text-ink">{complex.roadAddress ?? '—'}</dd>
        <dt className="text-ink-3">지번</dt>
        <dd className="col-span-3 text-ink">{complex.jibunAddress ?? '—'}</dd>
        {buildingInfo && (
          <>
            <dt className="text-ink-3">건물 정보</dt>
            <dd className="col-span-3 font-num tabular-nums text-ink">
              {[
                buildingInfo.approvalDate && `준공 ${buildingInfo.approvalDate}`,
                buildingInfo.householdCount != null && `${formatNumber(buildingInfo.householdCount)}세대`,
                buildingInfo.buildingCount != null && `${formatNumber(buildingInfo.buildingCount)}개 동`,
              ]
                .filter(Boolean)
                .join(' · ') || '—'}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
};

// 1단계 "기본 정보". "다음 · 임대 정보"를 누르면 호실·소유 관계를 만들고(POST /properties) 2단계로 간다.
const BasicInfoStep = ({ onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const search = useGetComplexSearchList(hookOptions);
  const resolve = usePostComplexResolve(hookOptions);
  const unitInfo = useGetComplexUnitInfo(hookOptions);
  const register = usePostProperty(hookOptions);

  const [query, setQuery] = useState('');
  const [queryError, setQueryError] = useState('');
  const [resolvingKey, setResolvingKey] = useState(null);
  const [complex, setComplex] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [unitInfoResult, setUnitInfoResult] = useState(null);
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  // 동·호 정보는 검색 요청 한도(20회/분)를 같이 쓰므로, 같은 값은 다시 묻지 않는다.
  // 키 `complexId|동|호`, 이 화면에 있는 동안만 저장한다.
  const unitInfoCacheRef = useRef(new Map());
  const lastUnitKeyRef = useRef(null);
  // 동·호 정보로 자동 채운 값. 사용자가 직접 고친 칸은 덮어쓰지 않는다.
  const autoFilledRef = useRef({ exclusiveArea: '', floor: '' });

  const clientErrors = validateForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];

  const buildingNo = normalizeBuildingNo(form.buildingNo);
  const unitNo = normalizeUnitNo(form.unitNo);
  const isReady = Boolean(complex && buildingNo && unitNo) && Object.keys(clientErrors).length === 0;
  const isSubmitting = register.isLoading;

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

  const handleSelectComplex = async (item) => {
    if (resolve.isLoading) return;
    setResolvingKey(item.sourceKey);
    const { data } = await resolve.resolveComplex({ sourceKey: item.sourceKey });
    setResolvingKey(null);
    if (!data) return;

    setComplex(data);
    setForm(EMPTY_FORM);
    autoFilledRef.current = { exclusiveArea: '', floor: '' };
    setUnitInfoResult(null);
    setServerFieldErrors({});
    lastUnitKeyRef.current = null;
  };

  const handleChangeComplex = () => {
    setComplex(null);
    setUnitInfoResult(null);
    lastUnitKeyRef.current = null;
  };

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setServerFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const applyUnitInfo = (result) => {
    setUnitInfoResult(result);
    if (result.status !== 'found') return;
    setForm((prev) => {
      const next = { ...prev };
      const filled = autoFilledRef.current;
      [
        ['exclusiveArea', result.exclusiveArea],
        ['floor', result.floor],
      ].forEach(([name, value]) => {
        if (value == null) return;
        // 비어 있거나 직전에 자동으로 채운 값 그대로일 때만 새 값으로 바꾼다.
        if (prev[name] === '' || prev[name] === filled[name]) {
          next[name] = String(value);
          filled[name] = String(value);
        }
      });
      return next;
    });
  };

  // 동·호가 둘 다 채워진 상태에서 칸을 벗어날 때, 직전에 물어본 값과 다를 때만 조회한다.
  const handleUnitBlur = async () => {
    if (!complex || !buildingNo || !unitNo || clientErrors.buildingNo || clientErrors.unitNo) return;

    const key = `${complex.id}|${buildingNo}|${unitNo}`;
    if (key === lastUnitKeyRef.current) return;
    lastUnitKeyRef.current = key;

    const cached = unitInfoCacheRef.current.get(key);
    if (cached) {
      applyUnitInfo(cached);
      return;
    }

    setUnitInfoResult({ status: 'loading' });
    const { data, error } = await unitInfo.fetchUnitInfo(complex.id, {
      buildingNo: form.buildingNo.trim(),
      unitNo: form.unitNo.trim(),
    });
    // 세션이 끊긴 경우 — 다음 blur에서 다시 묻는다.
    if (!data && !error) {
      if (lastUnitKeyRef.current === key) {
        lastUnitKeyRef.current = null;
        setUnitInfoResult(null);
      }
      return;
    }

    const result = data
      ? { status: 'found', exclusiveArea: data.exclusiveArea, floor: data.floor }
      : { status: 'missing', message: error.status === 404 ? null : error.message };
    // 찾았거나 없는(404) 결과만 저장한다. 503·429는 잠깐의 실패라 같은 동·호로 다시 물을 수 있게 둔다
    // (공공데이터 API는 처음 조회할 때 수 초씩 걸려 타임아웃이 나기도 한다).
    const isTransient = !data && error.status !== 404;
    if (!isTransient) unitInfoCacheRef.current.set(key, result);
    // 기다리는 사이 동·호를 바꿨으면 이 결과는 화면에 쓰지 않는다.
    if (lastUnitKeyRef.current === key) {
      applyUnitInfo(result);
      if (isTransient) lastUnitKeyRef.current = null;
    }
  };

  const handleSubmit = async () => {
    if (!isReady || isSubmitting) return;

    const { data, error } = await register.createProperty(toCreateBody(complex.id, form));
    if (data) {
      // 1단계 기록을 상세로 바꾸고 2단계를 쌓는다 → 2단계에서 뒤로 가면 상세, 1단계 재전송은 생기지 않는다.
      const { property } = data;
      onNavigate('propertyDetail', { propertyId: property.id }, { replace: true });
      onNavigate('propertyRegister', { step: 2, propertyId: property.id, displayName: property.displayName });
      return;
    }
    if (error?.status === 400) setServerFieldErrors(toFieldErrors(error));
  };

  const submitError = register.error;
  const hasMappedFieldError = submitError?.status === 400 && submitError.details.some(({ field }) => FORM_FIELDS.includes(field));
  const searchResults = search.data;
  const isBusy = search.isLoading || resolve.isLoading;

  return (
    <>
      <div className="flex items-center gap-2">
        <h2 className="text-section font-semibold text-ink">기본 정보</h2>
        <Badge>아파트</Badge>
      </div>

      <Card className="space-y-4 p-5">
        <p className="text-label font-semibold text-ink">단지 주소</p>
        {complex ? (
          <ComplexSummary complex={complex} onChange={handleChangeComplex} disabled={isSubmitting} />
        ) : (
          <>
            <form onSubmit={handleSearch} className="flex items-start gap-2">
              <TextField
                className="flex-1"
                aria-label="단지 주소 검색어"
                placeholder="도로명, 건물명, 지번으로 검색"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (queryError) setQueryError('');
                }}
                error={queryError}
                disabled={resolve.isLoading}
              />
              <Button type="submit" variant="secondary" className="h-12 shrink-0" disabled={isBusy}>
                <Search size={16} className="-ml-0.5 mr-1.5 inline-block" />
                {search.isLoading ? '검색 중' : '검색'}
              </Button>
            </form>

            {search.error && <NoticeBox>{search.error.message}</NoticeBox>}
            {resolve.error && <NoticeBox>{resolve.error.message}</NoticeBox>}

            {searchResults && searchResults.length === 0 && (
              <p className="rounded-input bg-surface-2 px-4 py-3 text-body text-ink-2">
                검색 결과가 없습니다. 검색되지 않는 단지는 운영자에게 등록을 요청해 주세요
              </p>
            )}

            {searchResults && searchResults.length > 0 && (
              <ul className="space-y-2">
                {searchResults.map((item) => {
                  const isResolving = resolvingKey === item.sourceKey;
                  return (
                    <li key={item.sourceKey}>
                      <button
                        type="button"
                        onClick={() => handleSelectComplex(item)}
                        disabled={resolve.isLoading}
                        className="flex w-full items-center justify-between gap-3 rounded-btn border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-accent hover:bg-surface-2 disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:bg-surface"
                      >
                        <span className="min-w-0">
                          <span className="block text-card font-semibold text-ink">{item.name}</span>
                          {item.roadAddress && <span className="mt-0.5 block text-sub text-ink-2">{item.roadAddress}</span>}
                          {item.jibunAddress && <span className="block text-sub text-ink-3">지번 {item.jibunAddress}</span>}
                        </span>
                        {isResolving && <span role="status" aria-label="단지 정보를 불러오는 중" className="shrink-0"><Loader2 size={18} className="animate-spin text-accent" aria-hidden="true" /></span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Card>

      <Card className="space-y-5 p-5">
        {!complex && <p className="text-sub text-ink-3">단지를 먼저 선택해 주세요.</p>}

        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="동"
            suffix="동"
            placeholder="101"
            value={form.buildingNo}
            onChange={(event) => updateField('buildingNo', event.target.value)}
            onBlur={handleUnitBlur}
            error={fieldError('buildingNo')}
            disabled={!complex || isSubmitting}
          />
          <TextField
            label="호"
            suffix="호"
            placeholder="1203"
            value={form.unitNo}
            onChange={(event) => updateField('unitNo', event.target.value)}
            onBlur={handleUnitBlur}
            error={fieldError('unitNo')}
            disabled={!complex || isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="전용면적"
              suffix="㎡"
              numeric
              placeholder="84.97"
              value={form.exclusiveArea}
              onChange={(event) => updateField('exclusiveArea', toAreaInput(event.target.value))}
              error={fieldError('exclusiveArea')}
              disabled={!complex || isSubmitting}
            />
            <TextField
              label="층"
              suffix="층"
              numeric
              inputMode="numeric"
              placeholder="12"
              value={form.floor}
              onChange={(event) => updateField('floor', toFloorInput(event.target.value))}
              error={fieldError('floor')}
              disabled={!complex || isSubmitting}
            />
          </div>
          <div aria-live="polite">
            {unitInfoResult?.status === 'loading' && (
              <p className="flex items-center gap-1.5 text-sub text-ink-3">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                건축물대장에서 면적·층을 찾는 중입니다
              </p>
            )}
            {unitInfoResult?.status === 'found' && <p className="text-sub text-ink-3">건축물대장 기준</p>}
            {unitInfoResult?.status === 'missing' && (
              <p className="text-sub text-warn-ink">
                {UNIT_INFO_MISSING_MESSAGE}
                {unitInfoResult.message && ` · ${unitInfoResult.message}`}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="취득 연월 (선택)"
            numeric
            inputMode="numeric"
            placeholder="2019-03"
            maxLength={7}
            value={form.acquiredYearMonth}
            onChange={(event) => updateField('acquiredYearMonth', toYearMonthInput(event.target.value))}
            error={fieldError('acquiredYearMonth')}
            disabled={!complex || isSubmitting}
          />
          <TextField
            label="매입가 (선택)"
            suffix="원"
            numeric
            inputMode="numeric"
            placeholder="650,000,000"
            maxLength={22}
            value={form.purchasePrice ? formatNumber(form.purchasePrice) : ''}
            onChange={(event) => updateField('purchasePrice', toPriceDigits(event.target.value))}
            error={fieldError('purchasePrice')}
            disabled={!complex || isSubmitting}
          />
        </div>
      </Card>

      <NoticeBox tone="seal">
        등록하면 &apos;미인증&apos; 상태로 저장됩니다 · 권리자 인증을 마치면 커뮤니티·분쟁 상담이 열립니다
      </NoticeBox>

      {submitError && !hasMappedFieldError && <NoticeBox>{submitError.message}</NoticeBox>}

      <BottomActionBar>
        {complex && buildingNo && unitNo && (
          <div className="mb-3">
            <p className="text-body font-semibold text-ink">{formatDisplayName(complex.name, buildingNo, unitNo)}로 등록합니다</p>
            <p className="text-sub text-ink-3">동·호는 등록 후 바꿀 수 없어요</p>
          </div>
        )}
        <Button size="lg" className="w-full" onClick={handleSubmit} disabled={!isReady || isSubmitting}>
          {isSubmitting ? '등록 중' : '다음 · 임대 정보'}
        </Button>
      </BottomActionBar>
    </>
  );
};

// 부동산 등록(design.md §6): 1단계 기본 정보 → 2단계 임대 정보(#4 전까지 자리 화면).
// 화면 뒤로 버튼은 브라우저 뒤로가기와 같다 — 2단계에서는 바로 아래 기록인 상세로 간다.
export const PropertyRegisterPage = ({ params, onNavigate, onUnauthorized }) => {
  const step = params.step ?? 1;
  const goBack = () => window.history.back();

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-40">
      <PageHeader title="부동산 등록" onBack={goBack} step={step} totalSteps={2} />
      {step === 2 ? (
        <LeaseInfoStepPlaceholder displayName={params.displayName} onDone={goBack} />
      ) : (
        <BasicInfoStep onNavigate={onNavigate} onUnauthorized={onUnauthorized} />
      )}
    </div>
  );
};

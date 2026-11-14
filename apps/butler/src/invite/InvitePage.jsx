import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getTenantInvitationContract,
  getTenantInvitationPreview,
  postTenantInvitationAccept,
  postTenantInvitationDocumentDownloadUrl,
  postTenantInvitationVerify,
} from '@butler/api-client';
import { invitePath, inviteRegisterPath } from '../auth/invitePath';
import { getOAuthErrorMessage } from '../auth/oauthErrorMessages';
import { getRoleHome } from '../auth/roleHome';
import { LOGIN_PATH } from '../auth/useLogout';
import { toApiError } from '../shared/apiError';
import { useSessionStore } from '../store/sessionStore';
import { CHECK_SESSION, decideAfterContract, decideInitialScreen, decideVerifyError, SCREEN, screenForError, toInviteErrorKind } from './inviteState';
import { ConfirmScreen } from './screens/ConfirmScreen';
import { ContractScreen } from './screens/ContractScreen';
import {
  AcceptedLinkScreen,
  AddedScreen,
  AlreadyAddedScreen,
  DailyLimitScreen,
  ErrorScreen,
  LinkedOtherScreen,
  LoadingScreen,
  UnusableScreen,
  WrongRoleScreen,
} from './screens/StatusScreens';
import { SummaryScreen } from './screens/SummaryScreen';
import { VerifyScreen } from './screens/VerifyScreen';

const TENANT_HOME = getRoleHome('TENANT');

// 주소의 1회용 표지(?oauth_error=코드 · ?joined=1)는 처음 열 때 한 번 읽고 주소에서 지운다.
const readFlags = (search) => {
  const params = new URLSearchParams(search);
  const code = params.get('oauth_error');
  return { oauthError: code ? getOAuthErrorMessage(code) : '', joined: params.get('joined') === '1' };
};

// /invite/:token — 로그인 상태별 분기(개발 계획 3-2 상태 표).
//   로그인 전: B1 → B2 → B3 → [가입하고 추가] /invite/:token/register · [로그인] /login(from 유지)
//   TENANT: 확인 세션이 살아 있으면 C2, 없으면 B1 → B2 → C2 → C3. 이미 연결 F2.
//   LANDLORD·ADMIN: F3. 쓸 수 없는 초대: F1.
// 토큰·확인 상태는 JS 저장소에 두지 않는다(확인 세션은 httpOnly 쿠키, 원칙 P3).
export const InvitePage = ({ token }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useSessionStore((state) => state.user);
  const logout = useSessionStore((state) => state.logout);
  const role = user?.role ?? null;

  const [flags] = useState(() => readFlags(location.search));
  const [screen, setScreen] = useState(SCREEN.LOADING);
  const [preview, setPreview] = useState(null);
  const [contract, setContract] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const [inlineError, setInlineError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [landlordName, setLandlordName] = useState(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (location.search) navigate(location.pathname, { replace: true, state: location.state });
    // 처음 한 번만 지운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadContract = useCallback(async () => {
    try {
      const data = await getTenantInvitationContract(token);
      setContract(data);
      return { kind: 'OK', data };
    } catch (error) {
      const apiError = toApiError(error);
      return { kind: toInviteErrorKind(apiError), apiError };
    }
  }, [token]);

  const showError = (apiError) => {
    setErrorMessage(apiError?.message ?? '');
    setScreen(SCREEN.ERROR);
  };

  // 처음 열 때·로그인 상태가 바뀔 때(로그아웃하고 계속 등) 다시 정한다.
  useEffect(() => {
    let ignore = false;
    setScreen(SCREEN.LOADING);
    setVerifyError(null);
    setInlineError('');
    const decide = async () => {
      if (role && role !== 'TENANT') {
        setScreen(SCREEN.WRONG_ROLE);
        return;
      }
      let previewKind = 'OK';
      let previewError = null;
      try {
        const data = await getTenantInvitationPreview(token);
        if (ignore) return;
        setPreview(data);
        setLandlordName(data.landlordName);
      } catch (error) {
        previewError = toApiError(error);
        previewKind = toInviteErrorKind(previewError);
      }
      if (ignore) return;
      const next = decideInitialScreen({ role, previewKind, joined: flags.joined });
      if (next === CHECK_SESSION) {
        const result = await loadContract();
        if (ignore) return;
        const after = decideAfterContract({ role, contractKind: result.kind });
        if (after === SCREEN.ERROR) showError(result.apiError);
        else setScreen(after);
        return;
      }
      if (next === SCREEN.ERROR) showError(previewError);
      else setScreen(next);
    };
    decide();
    return () => {
      ignore = true;
    };
  }, [token, role, reloadCount, flags.joined, loadContract]);

  const fetchDocumentUrl = useCallback((documentId) => postTenantInvitationDocumentDownloadUrl(token, documentId), [token]);

  // B1 [계약서 확인하기]: 확인 세션이 아직 살아 있으면(30분) B2 를 건너뛴다.
  const handleContinue = async () => {
    setBusy(true);
    const result = await loadContract();
    setBusy(false);
    if (result.kind === 'OK') setScreen(role === 'TENANT' ? SCREEN.CONFIRM : SCREEN.CONTRACT);
    else if (result.kind === 'VERIFY_REQUIRED') setScreen(SCREEN.VERIFY);
    else {
      const next = screenForError(result.kind, role);
      if (next) setScreen(next);
      else showError(result.apiError);
    }
  };

  const handleVerify = async (phoneLast4) => {
    setBusy(true);
    setVerifyError(null);
    try {
      await postTenantInvitationVerify(token, { phoneLast4 });
    } catch (error) {
      setBusy(false);
      const decision = decideVerifyError(toApiError(error), role);
      if (decision.screen) setScreen(decision.screen);
      else setVerifyError({ message: decision.message, waitSeconds: decision.waitSeconds ?? null });
      return;
    }
    const result = await loadContract();
    setBusy(false);
    if (result.kind === 'OK') {
      setScreen(role === 'TENANT' ? SCREEN.CONFIRM : SCREEN.CONTRACT);
      return;
    }
    const next = result.kind === 'VERIFY_REQUIRED' ? null : screenForError(result.kind, role);
    if (next) setScreen(next);
    else setVerifyError({ message: result.apiError?.message ?? '잠시 후 다시 시도해 주세요.' });
  };

  const handleAccept = async () => {
    setBusy(true);
    setInlineError('');
    try {
      const accepted = await postTenantInvitationAccept(token);
      setLandlordName(accepted?.landlord?.name ?? contract?.landlordName ?? landlordName);
      setScreen(SCREEN.ADDED);
    } catch (error) {
      const apiError = toApiError(error);
      const next = screenForError(toInviteErrorKind(apiError), role);
      if (next) setScreen(next);
      else setInlineError(apiError.message);
    } finally {
      setBusy(false);
    }
  };

  // 로그아웃한 뒤에도 이 초대 화면에 머문다(로그인 전 흐름 B1 부터). 세션이 지워지면 위 분기가 다시 돈다.
  const handleLogout = async () => {
    setBusy(true);
    try {
      await logout(() => navigate(invitePath(token), { replace: true }));
    } catch {
      setInlineError('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const goHome = () => navigate(TENANT_HOME, { replace: true });
  const backToSummary = () => setScreen(SCREEN.SUMMARY);

  switch (screen) {
    case SCREEN.SUMMARY:
      return preview ? <SummaryScreen preview={preview} notice={flags.oauthError} busy={busy} onContinue={handleContinue} /> : <LoadingScreen />;
    case SCREEN.VERIFY:
      return <VerifyScreen onBack={backToSummary} onSubmit={handleVerify} busy={busy} error={verifyError} />;
    case SCREEN.DAILY_LIMIT:
      return <DailyLimitScreen onBack={backToSummary} />;
    case SCREEN.CONTRACT:
      return (
        <ContractScreen
          contract={contract}
          fetchUrl={fetchDocumentUrl}
          notice={flags.oauthError}
          onBack={backToSummary}
          onRegister={() => navigate(inviteRegisterPath(token))}
          onLogin={() => navigate(LOGIN_PATH, { state: { from: invitePath(token) } })}
        />
      );
    case SCREEN.CONFIRM:
      return <ConfirmScreen contract={contract} email={user?.email} busy={busy} error={inlineError} onAccept={handleAccept} onSwitchAccount={handleLogout} />;
    case SCREEN.ADDED:
      return <AddedScreen landlordName={landlordName} onHome={goHome} />;
    case SCREEN.UNUSABLE:
      return <UnusableScreen />;
    case SCREEN.ACCEPTED_LINK:
      return <AcceptedLinkScreen onLogin={() => navigate(LOGIN_PATH)} />;
    case SCREEN.LINKED_OTHER:
      return <LinkedOtherScreen />;
    case SCREEN.ALREADY_ADDED:
      return <AlreadyAddedScreen onHome={goHome} />;
    case SCREEN.WRONG_ROLE:
      return <WrongRoleScreen onLogout={handleLogout} busy={busy} />;
    case SCREEN.ERROR:
      return <ErrorScreen message={errorMessage} onRetry={() => setReloadCount((count) => count + 1)} />;
    default:
      return <LoadingScreen />;
  }
};

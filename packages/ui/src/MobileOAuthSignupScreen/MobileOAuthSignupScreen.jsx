import { MobileFormLayout } from '../MobileShell/MobileFormLayout';
import { useOAuthSignupForm } from '../OAuthSignupScreen/useOAuthSignupForm';
import { AgreementRow } from '../MobileRegisterScreen/AgreementRow';
import { BIRTH_YEAR_MIN, NAME_MAX_LENGTH, todayString } from '../RegisterScreen/registerShared';
import { Button } from '../Button/Button';
import { TextField } from '../TextField/TextField';

const PROVIDER_LABEL = { GOOGLE: '구글', KAKAO: '카카오' };

// 앱 소셜 가입 추가정보 화면. 웹 OAuthSignupScreen 과 같은 입력 항목·규칙·API 호출(useOAuthSignupForm)이고, 모양은 Figma M02(회원가입)의 폼을 따른다.
// 이메일은 제공자가 알려 준 값으로 고정, 이름은 고칠 수 있다. 소셜 가입은 단계를 나누지 않고 한 화면이다(입력이 적어 "1 / 2"가 없다).
// onBack: 뒤로 가기(로그인 화면으로).
export const MobileOAuthSignupScreen = ({ loadInfo, onSubmit, onBack }) => {
  const { info, loadError, values, setValue, fieldErrors, formError, isSubmitting, submit } = useOAuthSignupForm({ loadInfo, onSubmit });
  const topBar = { title: '회원가입', onBack };

  if (loadError || !info) {
    return (
      <MobileFormLayout shell="oauth-signup-app" topBar={topBar}>
        {loadError ? (
          <p role="alert" className="rounded-input bg-crit-soft px-3 py-2 text-body text-crit-ink">
            {loadError}
          </p>
        ) : (
          <p role="status" className="py-6 text-center text-body text-ink-3">
            불러오는 중입니다
          </p>
        )}
      </MobileFormLayout>
    );
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    submit();
  };

  return (
    <MobileFormLayout
      shell="oauth-signup-app"
      topBar={topBar}
      onSubmit={handleSubmit}
      cta={
        <Button type="submit" size="h52" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? '가입 중...' : '가입 완료'}
        </Button>
      }
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-page-sm font-bold text-ink">계정 만들기</h2>
        <p className="text-body text-ink-2">
          {PROVIDER_LABEL[info.provider] ?? '소셜'} 계정으로 로그인했습니다. 가입을 마치려면 아래 정보를 입력해주세요.
        </p>
      </div>
      <TextField mobile label="이메일" type="email" value={info.email} disabled readOnly hint="소셜 계정의 이메일은 바꿀 수 없습니다" />
      <TextField
        mobile
        label="이름"
        required
        autoComplete="name"
        placeholder="홍길동"
        value={values.name}
        onChange={setValue('name')}
        error={fieldErrors.name}
        maxLength={NAME_MAX_LENGTH * 2}
      />
      <TextField
        mobile
        label="생년월일"
        type="date"
        required
        autoComplete="bday"
        hint="소유주 인증에 사용합니다"
        min={`${BIRTH_YEAR_MIN}-01-01`}
        max={todayString()}
        value={values.birthDate}
        onChange={setValue('birthDate')}
        error={fieldErrors.birthDate}
      />
      <TextField
        mobile
        label="휴대폰 (선택)"
        type="tel"
        autoComplete="tel"
        placeholder="010-1234-5678"
        value={values.phone}
        onChange={setValue('phone')}
        error={fieldErrors.phone}
      />
      <div className="rounded-card border border-line bg-surface px-4 py-1">
        <AgreementRow id="oauth-app-terms" checked={values.termsAgreed} onChange={setValue('termsAgreed')} error={fieldErrors.termsAgreed}>
          [필수] 이용약관 동의
        </AgreementRow>
        <AgreementRow id="oauth-app-privacy" checked={values.privacyAgreed} onChange={setValue('privacyAgreed')} error={fieldErrors.privacyAgreed}>
          [필수] 개인정보 수집·이용 동의
          <span className="mt-0.5 block text-chip text-ink-3">수집 항목: 이름, 이메일, 생년월일(암호화 저장), 휴대폰 번호(선택, 암호화 저장)</span>
        </AgreementRow>
      </div>
      <p className="rounded-btn bg-surface-2 px-3.5 py-3 text-m-sub text-ink-2">주민등록번호는 받지 않습니다. 생년월일과 휴대폰 번호는 암호화해 보관합니다.</p>

      {formError && (
        <p role="alert" className="rounded-input bg-crit-soft px-3 py-2 text-body text-crit-ink">
          {formError}
        </p>
      )}
    </MobileFormLayout>
  );
};

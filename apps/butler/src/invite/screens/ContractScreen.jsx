import { Button } from '@butler/ui';
import { SharedDocuments } from '../../shared/documentViewer/SharedDocuments';
import { InviteFrame } from '../InviteFrame';
import { ContractTerms } from '../../shared/ContractTerms';
import { Notice } from './Notice';

// B3 계약서 보기(본인 확인 뒤, 로그인 전). 금액·공유 파일을 보여 주고 아래 두 버튼이 가입(D)·로그인(C)으로 갈라진다.
export const ContractScreen = ({ contract, fetchUrl, notice, onBack, onRegister, onLogin }) => (
  <InviteFrame
    top={{ title: '계약서', onBack }}
    ctaBar
    cta={
      <>
        <Button size="h48" className="w-full" onClick={onRegister}>
          처음이에요 · 가입하고 추가
        </Button>
        <Button size="h48" variant="secondary" className="w-full" onClick={onLogin}>
          계정이 있어요 · 로그인
        </Button>
      </>
    }
  >
    {notice && <Notice>{notice}</Notice>}
    <ContractTerms contract={contract} />
    <SharedDocuments documents={contract.sharedDocuments ?? []} fetchUrl={fetchUrl} title="공유된 계약서" />
  </InviteFrame>
);

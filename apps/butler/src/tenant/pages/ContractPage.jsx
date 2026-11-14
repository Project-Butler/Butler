import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, MobileFormLayout } from '@butler/ui';
import { getDocumentList, postDocumentDownloadUrl } from '@butler/api-client';
import { ContractTerms } from '../../shared/ContractTerms';
import { SharedDocuments } from '../../shared/documentViewer/SharedDocuments';
import { useGetContract } from '../../shared/useGetContract';
import { useLoad } from '../hooks/useLoad';
import { HOME_PATH } from '../routes';
import { toContractTerms } from '../utils/home';

// 공유받은 계약서는 계약당 10개까지라 한 쪽으로 받는다.
const DOCUMENT_PAGE_SIZE = 50;

// 임차인 계약서(시안 E2): 금액 · 기간 · 임대인, 공유받은 계약서(파일 줄 + 사진 3칸 격자 → 뷰어 B4).
// 임대인 서류함의 다른 서류·메모는 보이지 않는다(서버 정책). 보기만 하고 올리지 않는다(결정 4).
export const ContractPage = ({ onUnauthorized }) => {
  const { contractId } = useParams();
  const navigate = useNavigate();
  const contract = useGetContract(contractId, { onUnauthorized });
  const documents = useLoad(
    contractId ? `contract-documents:${contractId}` : null,
    () => getDocumentList({ resourceType: 'CONTRACT', resourceId: contractId, size: DOCUMENT_PAGE_SIZE }).then((body) => body.data ?? []),
    { onUnauthorized },
  );

  return (
    <MobileFormLayout shell="tenant" topBar={{ title: '내 계약', onBack: () => navigate(HOME_PATH) }}>
      {contract.isLoading && (
        <p role="status" className="text-body text-ink-3">
          계약을 불러오는 중이에요
        </p>
      )}
      {contract.error && (
        <Card>
          <p role="alert" className="text-body text-crit-ink">
            {contract.error.status === 404 ? '계약을 찾을 수 없어요.' : contract.error.message}
          </p>
          {contract.error.status !== 404 && (
            <Button variant="secondary" size="h44" className="mt-3 w-full" onClick={contract.refetch}>
              다시 불러오기
            </Button>
          )}
        </Card>
      )}
      {contract.data && (
        <>
          <ContractTerms contract={toContractTerms(contract.data)} />
          {documents.isLoading && (
            <p role="status" className="text-m-sub text-ink-3">
              계약서를 불러오는 중이에요
            </p>
          )}
          {documents.error && (
            <p role="alert" className="text-m-sub text-crit-ink">
              {documents.error.message}
            </p>
          )}
          {documents.data && <SharedDocuments variant="cards" title="공유받은 계약서" documents={documents.data} fetchUrl={postDocumentDownloadUrl} />}
        </>
      )}
    </MobileFormLayout>
  );
};

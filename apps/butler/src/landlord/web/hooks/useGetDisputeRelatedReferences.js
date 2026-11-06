import { useQuery } from '@tanstack/react-query';
import { getDisputeRelatedReferences, queryKey } from '@butler/api-client';

export const useGetDisputeRelatedReferences = (referenceId) =>
  useQuery({
    queryKey: [queryKey.DISPUTE_REFERENCE_RELATED, referenceId],
    queryFn: () => getDisputeRelatedReferences(referenceId),
    enabled: Boolean(referenceId),
  });

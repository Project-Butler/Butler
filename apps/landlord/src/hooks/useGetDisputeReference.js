import { useQuery } from '@tanstack/react-query';
import { getDisputeReference, queryKey } from '@butler/api-client';

export const useGetDisputeReference = (referenceId) =>
  useQuery({
    queryKey: [queryKey.DISPUTE_REFERENCE_DETAIL, referenceId],
    queryFn: () => getDisputeReference(referenceId),
    enabled: Boolean(referenceId),
  });

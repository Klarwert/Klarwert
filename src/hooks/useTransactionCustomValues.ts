import { useQuery } from "@tanstack/react-query";
import { getCustomValuesForTransaction } from "@/db/repositories/customFields";

export function useTransactionCustomValues(transactionId: number | null) {
  return useQuery({
    queryKey: ["transaction-custom-values", transactionId],
    queryFn: () => transactionId ? getCustomValuesForTransaction(transactionId) : Promise.resolve([]),
    enabled: !!transactionId,
  });
}

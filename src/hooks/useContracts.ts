import { useQuery } from "@tanstack/react-query";
import { listContracts } from "@/db/repositories/contracts";
import { listRecurringPayments } from "@/db/repositories/recurringPayments";

export function useContracts() {
  return useQuery({ queryKey: ["contracts"], queryFn: listContracts });
}

export function useRecurringPayments() {
  return useQuery({ queryKey: ["recurring-payments"], queryFn: listRecurringPayments });
}

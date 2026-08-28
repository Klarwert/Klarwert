import { useQuery } from "@tanstack/react-query";
import { listRules } from "@/db/repositories/rules";

export function useRules() {
  return useQuery({ queryKey: ["rules"], queryFn: listRules });
}

import { useQuery } from "@tanstack/react-query";
import { listCustomFields } from "@/db/repositories/customFields";

export function useCustomFields() {
  return useQuery({
    queryKey: ["custom-fields"],
    queryFn: listCustomFields,
  });
}

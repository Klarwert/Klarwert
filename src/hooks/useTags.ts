import { useQuery } from "@tanstack/react-query";
import { listTags } from "@/db/repositories/tags";

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: listTags });
}

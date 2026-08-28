import { useQuery } from "@tanstack/react-query";
import { listAssets } from "@/db/repositories/assets";

export function useAssets(includeArchived = true) {
  return useQuery({
    queryKey: ["assets", includeArchived],
    queryFn: () => listAssets(includeArchived),
  });
}

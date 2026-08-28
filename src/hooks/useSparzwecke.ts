import { useQuery } from "@tanstack/react-query";
import { listSparzwecke } from "@/db/repositories/sparzwecke";

export function useSparzwecke() {
  return useQuery({
    queryKey: ["sparzwecke"],
    queryFn: listSparzwecke,
  });
}

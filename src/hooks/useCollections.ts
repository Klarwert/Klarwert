import { useQuery } from "@tanstack/react-query";
import { listCollections } from "@/db/repositories/collections";

export function useCollections() {
  return useQuery({ queryKey: ["collections"], queryFn: listCollections });
}

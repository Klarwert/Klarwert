import { useQuery } from "@tanstack/react-query";
import { listPersons } from "@/db/repositories/persons";

export function usePersons(includeInactive = false) {
  return useQuery({
    queryKey: ["persons", includeInactive],
    queryFn: () => listPersons(includeInactive),
  });
}

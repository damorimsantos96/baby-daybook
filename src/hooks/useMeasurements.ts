import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteMeasurement,
  fetchMeasurements,
  fetchMeasurementsForChildren,
  upsertMeasurement,
} from "@/lib/api";
import type { Measurement } from "@/types";

export function useMeasurements(childId: string) {
  return useQuery({
    queryKey: ["measurements", childId],
    queryFn: () => fetchMeasurements(childId),
    enabled: !!childId,
  });
}

export function useMeasurementsForChildren(childIds: string[]) {
  const stableChildIds = [...new Set(childIds)].sort();
  const queryKey = stableChildIds.join(",");

  return useQuery({
    queryKey: ["measurements", "children", queryKey],
    queryFn: () => fetchMeasurementsForChildren(stableChildIds),
    enabled: stableChildIds.length > 0,
  });
}

export function useUpsertMeasurement(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: Partial<Measurement> & { child_id: string; date: string }) =>
      upsertMeasurement(m),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["measurements", childId] });
      qc.invalidateQueries({ queryKey: ["measurements", "children"] });
    },
  });
}

export function useDeleteMeasurement(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMeasurement(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["measurements", childId] });
      qc.invalidateQueries({ queryKey: ["measurements", "children"] });
    },
  });
}

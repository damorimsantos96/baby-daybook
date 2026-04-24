import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteChild,
  fetchChild,
  fetchChildren,
  upsertChild,
  uploadChildPhoto,
  getChildPhotoUrl,
} from "@/lib/api";
import type { Child } from "@/types";

export function useChildren() {
  return useQuery({
    queryKey: ["children"],
    queryFn: fetchChildren,
  });
}

export function useChild(id: string) {
  return useQuery({
    queryKey: ["children", id],
    queryFn: () => fetchChild(id),
    enabled: !!id,
  });
}

export function useChildPhotoUrl(childId: string) {
  return useQuery({
    queryKey: ["child-photo", childId],
    queryFn: () => getChildPhotoUrl(childId),
    enabled: !!childId,
    staleTime: 1000 * 60 * 20, // re-fetch every 20 min (URL expires in 24h)
  });
}

export function useUpsertChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (child: Partial<Child> & { id?: string }) => upsertChild(child),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children"] });
    },
  });
}

export function useUploadChildPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ childId, uri }: { childId: string; uri: string }) =>
      uploadChildPhoto(childId, uri),
    onSuccess: (_data, { childId }) => {
      qc.invalidateQueries({ queryKey: ["child-photo", childId] });
    },
  });
}

export function useDeleteChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteChild(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children"] });
    },
  });
}

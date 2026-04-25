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

function isDirectPhotoUrl(photoUrl?: string | null): photoUrl is string {
  return !!photoUrl && /^(data:|https?:\/\/)/.test(photoUrl);
}

export function useChildPhotoUrl(childId: string, photoUrl?: string | null) {
  const directPhotoUrl = isDirectPhotoUrl(photoUrl) ? photoUrl : null;
  const query = useQuery({
    queryKey: ["child-photo", childId],
    queryFn: () => getChildPhotoUrl(childId),
    enabled: !!childId && !!photoUrl && !directPhotoUrl,
    staleTime: 1000 * 60 * 20, // re-fetch every 20 min (URL expires in 24h)
  });

  return {
    ...query,
    data: directPhotoUrl ?? query.data ?? null,
  };
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
    mutationFn: ({
      childId,
      uri,
      mimeType,
      base64Data,
      webFile,
    }: {
      childId: string;
      uri: string;
      mimeType?: string;
      base64Data?: string;
      webFile?: File | null;
    }) => uploadChildPhoto({ childId, uri, mimeType, base64Data, webFile }),
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

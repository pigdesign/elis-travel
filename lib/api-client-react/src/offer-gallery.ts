import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface OfferGalleryImage {
  id: string;
  offerId: string;
  imageUrl: string;
  sortOrder: number;
  createdAt: string;
}

// --- Query key helpers ---

export function getOfferImagesQueryKey(offerId: string) {
  return ["admin", "offers", offerId, "images"] as const;
}

// --- Fetch functions ---

function fetchOfferImages(offerId: string): Promise<OfferGalleryImage[]> {
  return customFetch<OfferGalleryImage[]>(`/api/admin/offers/${offerId}/images`);
}

function addOfferImage(offerId: string, imageUrl: string): Promise<OfferGalleryImage> {
  return customFetch<OfferGalleryImage>(`/api/admin/offers/${offerId}/images`, {
    method: "POST",
    body: JSON.stringify({ imageUrl }),
  });
}

function deleteOfferImage(offerId: string, imageId: string): Promise<{ ok: boolean }> {
  return customFetch<{ ok: boolean }>(`/api/admin/offers/${offerId}/images/${imageId}`, {
    method: "DELETE",
  });
}

function reorderOfferImages(offerId: string, order: string[]): Promise<OfferGalleryImage[]> {
  return customFetch<OfferGalleryImage[]>(`/api/admin/offers/${offerId}/images/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ order }),
  });
}

// --- Hooks ---

export function useGetOfferImages(
  offerId: string,
  options?: Omit<UseQueryOptions<OfferGalleryImage[]>, "queryKey" | "queryFn">,
) {
  return useQuery<OfferGalleryImage[]>({
    queryKey: getOfferImagesQueryKey(offerId),
    queryFn: () => fetchOfferImages(offerId),
    ...options,
  });
}

export function useAddOfferImage(
  offerId: string,
  options?: UseMutationOptions<OfferGalleryImage, unknown, string>,
) {
  const queryClient = useQueryClient();
  return useMutation<OfferGalleryImage, unknown, string>({
    mutationFn: (imageUrl: string) => addOfferImage(offerId, imageUrl),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getOfferImagesQueryKey(offerId) });
    },
    ...options,
  });
}

export function useDeleteOfferImage(offerId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, unknown, string>({
    mutationFn: (imageId: string) => deleteOfferImage(offerId, imageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getOfferImagesQueryKey(offerId) });
    },
  });
}

export function useReorderOfferImages(offerId: string) {
  const queryClient = useQueryClient();
  return useMutation<OfferGalleryImage[], unknown, string[]>({
    mutationFn: (order: string[]) => reorderOfferImages(offerId, order),
    onSuccess: (data) => {
      queryClient.setQueryData(getOfferImagesQueryKey(offerId), data);
    },
  });
}

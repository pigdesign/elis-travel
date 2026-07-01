import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface OfferDocument {
  id: string;
  offerId: string;
  documentUrl: string;
  fileName: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface AddOfferDocumentInput {
  documentUrl: string;
  fileName?: string | null;
}

// --- Query key helpers ---

export function getOfferDocumentsQueryKey(offerId: string) {
  return ["admin", "offers", offerId, "documents"] as const;
}

// --- Fetch functions ---

function fetchOfferDocuments(offerId: string): Promise<OfferDocument[]> {
  return customFetch<OfferDocument[]>(`/api/admin/offers/${offerId}/documents`);
}

export function addOfferDocument(offerId: string, input: AddOfferDocumentInput): Promise<OfferDocument> {
  return customFetch<OfferDocument>(`/api/admin/offers/${offerId}/documents`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function deleteOfferDocument(offerId: string, documentId: string): Promise<{ ok: boolean }> {
  return customFetch<{ ok: boolean }>(`/api/admin/offers/${offerId}/documents/${documentId}`, {
    method: "DELETE",
  });
}

// --- Hooks ---

export function useGetOfferDocuments(
  offerId: string,
  options?: Omit<UseQueryOptions<OfferDocument[]>, "queryKey" | "queryFn">,
) {
  return useQuery<OfferDocument[]>({
    queryKey: getOfferDocumentsQueryKey(offerId),
    queryFn: () => fetchOfferDocuments(offerId),
    ...options,
  });
}

export function useAddOfferDocument(
  offerId: string,
  options?: UseMutationOptions<OfferDocument, unknown, AddOfferDocumentInput>,
) {
  const queryClient = useQueryClient();
  return useMutation<OfferDocument, unknown, AddOfferDocumentInput>({
    mutationFn: (input: AddOfferDocumentInput) => addOfferDocument(offerId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getOfferDocumentsQueryKey(offerId) });
    },
    ...options,
  });
}

export function useDeleteOfferDocument(offerId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, unknown, string>({
    mutationFn: (documentId: string) => deleteOfferDocument(offerId, documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getOfferDocumentsQueryKey(offerId) });
    },
  });
}

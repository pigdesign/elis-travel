--- artifacts/elis-travel/src/pages/(public)/ExcursionDetailPage.tsx
+++ artifacts/elis-travel/src/pages/(public)/ExcursionDetailPage.tsx
@@ -53,6 +53,11 @@
   const excursionId = extractIdFromSlug(excursionIdOrSlug);
   const { data: excursion, isLoading, isError, error, status } = useGetPublicExcursion(excursionId);
   const [, setLocation] = useLocation();
+
+  useEffect(() => {
+    console.log("ExcursionDetailPage MOUNTED", excursionIdOrSlug);
+    return () => console.log("ExcursionDetailPage UNMOUNTED", excursionIdOrSlug);
+  }, [excursionIdOrSlug]);
+
+  useEffect(() => {
+    console.log("Query state:", { isLoading, isError, status, error });
+  }, [isLoading, isError, status, error]);
 
   const dateForSeo = (() => {

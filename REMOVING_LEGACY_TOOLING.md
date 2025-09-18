# 🚀 TurboFit tRPC Migration Checklist

## 1️⃣ Mobile Client Migration

### ✅ Setup

* `apps/mobile/src/lib/trpc.ts` already configured with `httpBatchLink` and Supabase session headers.
* Create `useTrpc` hook to simplify usage across components.

### 🔄 Migration Steps

1. **Replace all legacy Supabase auth calls**

   * Search `supabase.auth.signInWithPassword` → replace with `trpc.auth.signInWithPassword.mutate`
   * Check other auth calls (`signOut`, `refreshSession`) and wrap them with tRPC.

2. **Replace direct storage calls**

   * All `supabase.storage` operations must go through tRPC.
   * **If any storage endpoint doesn’t exist in tRPC**, add them:

     * `createSignedUploadUrl`
     * `getSignedDownloadUrl`
     * `deleteFile`
   * Example usage:

   ```ts
   const { signedUrl } = await trpc.storage.createSignedUploadUrl.mutate({
     fileName: 'avatar.jpg',
     fileType: 'image/jpeg'
   });
   ```

3. **Replace direct database access** (if any mobile code reads/writes Supabase directly)

   * All `public` schema operations (profiles, activities, etc.) must be via tRPC.
   * Create new tRPC routers for tables not yet covered.

4. **Update service classes**

   * `ActivityService.ts`, `ProfileService.ts`, etc. → replace direct Supabase calls with tRPC procedures.

---

## 2️⃣ Web App Migration

1. **Update components using auth or API calls**

   * `**/*.tsx` → switch from Supabase SDK to tRPC procedures.

2. **Check server-side code**

   * `middleware.ts` may still use Supabase session checks → wrap/replace with tRPC context session.

---

## 3️⃣ tRPC Router Coverage Audit

- Authentication
- Storage
- Public Schema


> ⚠️ **Rule of thumb:** Every client operation (auth, storage, public schema, or sync) **must call tRPC**. If it doesn’t exist, add it in the router.

---

## 4️⃣ File Management Strategy

### Preserve (Offline/Legacy)

* `apps/mobile/src/lib/db/**` → offline SQLite
* `apps/mobile/drizzle.config.ts` → local config
* `apps/web/middleware.ts` → SSR auth

### Modify / Replace

* `apps/mobile/src/lib/stores/auth-store.ts` → wrap tRPC calls
* `apps/mobile/src/lib/api/*` → replace Supabase calls with tRPC procedures
* `apps/web/components/*` → replace Supabase calls with tRPC

### Create

* `apps/mobile/src/lib/trpc.ts`
* `apps/mobile/src/lib/hooks/useTrpc.ts`

---

## 5️⃣ Sync & Offline Considerations

* Local Drizzle ORM remains untouched.
* Any **sync with Supabase** should now call tRPC endpoints.
* Offline queue should trigger tRPC mutations when online.

---

## 6️⃣ Verification Steps

1. **Mobile**:

   * Remove all `/api/*` calls → should break if any remain.
   * Replace with `trpc` calls → test end-to-end.
2. **Web**:

   * Ensure `auth-provider.tsx` fully relies on tRPC.
3. **Storage**:

   * Upload/download/delete via tRPC → confirm signed URL workflow.
4. **Public schema**:

   * Read/write through tRPC → verify permissions and responses.

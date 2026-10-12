# T0 Storage Spike Notes & Owner Verification Checklist

## 1. Storage Choice & Rationale
We selected `@sqlite.org/sqlite-wasm` operating inside a dedicated Web Worker, backed by the Origin Private File System (`opfs-sahpool` or OPFS VFS).
- **Why**: SQLite provides strict transactional integrity, foreign key enforcement, zero-float integer math, and instantaneous querying. The Web Worker keeps disk I/O off the main UI thread, keeping 60fps animations smooth even with large catalogs.
- **Header Independence**: The worker does not mandate COOP/COEP isolation headers, ensuring seamless hosting on static platforms like Cloudflare Pages.
- **Repository Isolation**: All SQL is abstracted behind repository interfaces (`IProductRepository`, `IInvoiceRepository`, `IStockRepository`, etc.), enabling seamless engine replacement without altering domain or UI layers.

## 2. What Could Not Be Verified Without the Physical Phone
1. Actual flash storage write speed and SQLite file locking behavior on Android 10+ mobile storage under Brave / Chrome with mobile power-saving modes.
2. OS-level battery optimization kill behavior when the PWA is backgrounded during an active database transaction.
3. Brave Shields aggressive blocking behavior on OPFS OriginPrivateFileSystem access handles.

## 3. Manual 8-Step Verification Checklist for the Owner
Run these tests directly on your Android phone (Brave/Chrome):

1. **10,000 Rows Benchmark**:
   - Go to Settings > Diagnostics > Benchmark.
   - Tap "Run 10,000 Rows Write Test". Time should complete under 1.5 seconds.
2. **Hard Reload Test**:
   - Add a test customer and product. Refresh the browser tab.
   - Confirm all data persists without prompt.
3. **Phone Restart Test**:
   - Turn phone off completely and turn back on.
   - Open browser and navigate to the app URL. Verify all records remain intact.
4. **Installed PWA Test**:
   - Tap browser menu > "Add to Home screen" / "Install Business OS".
   - Launch from home screen icon. Confirm standalone display without browser URL bar.
5. **Airplane Mode / Full Offline Test**:
   - Switch phone into Airplane mode (Wi-Fi & Cellular OFF).
   - Create a complete sale invoice with GST, print preview PDF, and verify offline operation.
6. **Two Tabs Concurrency Check**:
   - Open Business OS in two separate browser tabs.
   - Add a product in Tab 1; switch to Tab 2 and refresh. Verify no SQLite locking errors occur.
7. **`navigator.storage.persist()` Check**:
   - Check Settings > Storage Diagnostics.
   - Confirm persistent storage shows "Granted" (eviction protection active).
8. **HTTP Headers Verification**:
   - Confirm Cloudflare Pages serves static assets without requiring custom COOP/COEP headers.

# Aktualizace VAPID klíčů v Vercel

## Nové VAPID klíče (vygenerovány 2025-11-12 pro Apple Push kompatibilitu)

Jdi do Vercel Dashboard → Settings → Environment Variables a aktualizuj tyto hodnoty:

### 1. NEXT_PUBLIC_VAPID_PUBLIC_KEY
```
BJ8ClqJhb1tHseb28Xk0GE0ZaSxRcJVVNjRn2OqbP883dOgtUxy6OOHIC45y-mXwCW8hmjG7rsoN-AGBBIoUW2I
```
- **Environment:** All Environments (Production, Preview, Development)

### 2. VAPID_PUBLIC_KEY
```
BJ8ClqJhb1tHseb28Xk0GE0ZaSxRcJVVNjRn2OqbP883dOgtUxy6OOHIC45y-mXwCW8hmjG7rsoN-AGBBIoUW2I
```
- **Environment:** All Environments

### 3. VAPID_PRIVATE_KEY
```
HMnR_DWEC-rDdENQ5y5ZaFewW2vw9p-C90mt5F-vsb0
```
- **Environment:** All Environments
- **⚠️ DŮLEŽITÉ:** Tento klíč je PRIVÁTNÍ - nikdy ho nesdílej veřejně!

### 4. VAPID_SUBJECT
```
mailto:viktor.roskot@gmail.com
```
- **Environment:** All Environments

## Po aktualizaci v Vercel:

1. **Redeploy aplikace** (Vercel automaticky redeployuje po změně env variables, ale pro jistotu můžeš spustit manuální redeploy)

2. **Smaž staré subscriptions v Supabase:**
   ```sql
   DELETE FROM public.push_subscriptions;
   ```

3. **Na Viktorově iPhonu:**
   - Otevři PWA aplikaci z ikony na ploše
   - Klikni "Registrovat notifikace (Retry subscribe)"
   - Tím se vytvoří nová subscription s novými VAPID klíči

4. **Test:**
   ```powershell
   $body = @{ username = "Viktor"; title = "Test s novými klíči"; body = "Mělo by fungovat!" } | ConvertTo-Json
   $response = Invoke-RestMethod -Uri "https://firemni-ukoly.vercel.app/api/push/send" -Method Post -Body $body -ContentType "application/json"
   $response | ConvertTo-Json -Depth 10
   ```

## Důvod změny:

Staré VAPID klíče nebyly plně kompatibilní s Apple Web Push protokolem. Nové klíče vygenerovány pomocí `npx web-push generate-vapid-keys` by měly fungovat s Apple Push servery.

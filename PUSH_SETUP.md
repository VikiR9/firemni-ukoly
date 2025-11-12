# Setup Push Notifications - Instrukce

## Krok 1: Vygenerujte VAPID klíče

VAPID klíče jsou nutné pro Web Push API. Spusťte tento příkaz v PowerShellu ve složce projektu:

```powershell
npx web-push generate-vapid-keys
```

Výstup bude vypadat nějak takto:
```
=======================================

Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib27SX5fEd5SKEfTw...

Private Key:
UUxI4O8DdXfaIrNSHUvb5JT1n32ysjpI3...

=======================================
```

## Krok 2: Přidejte klíče do `.env.local`

Otevřete soubor `.env.local` (nebo vytvořte nový v kořenové složce projektu) a přidejte:

```env
# Supabase (už byste měli mít)
NEXT_PUBLIC_SUPAB ASE_URL=vaše_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=váš_anon_key

# VAPID klíče pro push notifikace
NEXT_PUBLIC_VAPID_PUBLIC_KEY=zde_vložte_PUBLIC_KEY_z_kroku_1
VAPID_PRIVATE_KEY=zde_vložte_PRIVATE_KEY_z_kroku_1
VAPID_SUBJECT=mailto:vas-email@example.com
```

⚠️ **Důležité:**
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` musí začínat `NEXT_PUBLIC_` (je to public key, používá se v prohlížeči)
- `VAPID_PRIVATE_KEY` je soukromý klíč (bez prefixu `NEXT_PUBLIC_`) — nikdy ho nesdílejte!
- `VAPID_SUBJECT` je vaše kontaktní email nebo URL

## Krok 3: Přidejte stejné proměnné do Vercel

Pokud používáte Vercel pro deployment:

1. Jděte na https://vercel.com/
2. Otevřete svůj projekt `firemni-ukoly`
3. Klikněte na **Settings** → **Environment Variables**
4. Přidejte tyto proměnné (každou zvlášť):
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = váš public key
   - `VAPID_PRIVATE_KEY` = váš private key
   - `VAPID_SUBJECT` = mailto:vas-email@example.com
5. Vyberte **Production**, **Preview** a **Development** (všechny tři zaškrtnuté)
6. Klikněte **Save**

## Krok 4: Spusťte migraci v Supabase

1. Jděte na https://supabase.com/ → váš projekt
2. V levém menu klikněte na **SQL Editor**
3. Otevřete soubor `db/migrations/0003_create_push_subscriptions.sql` z vašeho projektu
4. Zkopírujte celý SQL kód a vložte do SQL Editoru v Supabase
5. Klikněte **Run** (nebo `Ctrl+Enter`)

Tím vytvoříte tabulku `push_subscriptions` kde se ukládají push subscription endpointy uživatelů.

## Krok 5: Přidejte ikony do `/public`

Vytvořte jednoduché ikony (nebo použijte nějaký generátor):

- `public/icon-192.png` (192×192 px)
- `public/icon-512.png` (512×512 px)
- `public/badge-72.png` (72×72 px)

Můžete použít například https://www.favicon-generator.org/ nebo vytvořit jednoduché barevné čtverce v Paint/Photoshopu.

## Krok 6: Redeploy na Vercel

Po přidání env proměnných do Vercelu:

```powershell
git add -A
git commit -m "feat: complete web push implementation"
git push origin main
```

Vercel automaticky provede nový build s novými proměnnými prostředí.

## Krok 7: Testování

### Na desktopu (Chrome, Edge, Firefox):
1. Otevřete aplikaci
2. Přihlaste se
3. Prohlížeč se automaticky zeptá na povolení notifikací → **Povolit**
4. Service worker se zaregistruje
5. Vytvořte nový úkol pro přihlášeného uživatele
6. Měla by přijít notifikace i když zavřete aplikaci (pokud je otevřena v jiné záložce nebo zavřená)

### Na iPhone / iOS (Safari):
1. Otevřete `https://firemni-ukoly.vercel.app` v Safari
2. Klikněte na tlačítko **Sdílet** (ikona se šipkou)
3. Vyberte **Přidat na plochu** ("Add to Home Screen")
4. Otevřete aplikaci z plochy (ne z Safari!)
5. Přihlaste se
6. Safari se zeptá na povolení notifikací → **Povolit**
7. Nyní budete dostávat push notifikace i když je aplikace zavřená

⚠️ **Poznámka k iOS:**
- Push notifikace na iOS fungují **POUZE** pokud je aplikace nainstalována na plochu (PWA)
- V běžném Safari prohlížeči notifikace nefungují
- iOS vyžaduje HTTPS (Vercel to má automaticky)

## Troubleshooting

### "Service Worker failed to register"
- Ujistěte se, že aplikace běží na HTTPS (lokálně `localhost` je OK, jinak nutný HTTPS)
- Zkontrolujte konzoli v DevTools

### "VAPID public key not set in environment"
- Zkontrolujte že `.env.local` obsahuje `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- Restartujte dev server (`npm run dev`)
- Na Vercelu zkontrolujte že env variable je nastavená a re-deployujte

### Notifikace nepřichází
1. Zkontrolujte že tabulka `push_subscriptions` existuje v Supabase
2. Ověřte že řádek pro uživatele je v tabulce (po přihlášení se uloží subscription)
3. Zkontrolujte konzoli Vercelu (logs) jestli API endpoint `/api/push/send` nevrací chybu
4. Ujistěte se, že `VAPID_PRIVATE_KEY` je správně nastavený na Vercelu

### Push subscription fails
- Zkontrolujte že Notification.permission je "granted"
- V Chrome DevTools → Application → Service Workers ověřte že SW je aktivní
- Clear site data a zkuste znovu

## Další kroky

- **RLS policies**: Doporučuji přidat Row Level Security na `push_subscriptions` aby uživatelé nemohli vidět/smazat cizí subscriptions
- **Ikony**: Nahraďte placeholder ikony profesionálními (můžete použít logo firmy)
- **Rate limiting**: Na produkci zvažte rate limit pro `/api/push/send` (ochrana před spamem)

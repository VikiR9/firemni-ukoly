# Firemní aplikace LIMMIT

Interní Next.js aplikace pro úkoly, kalkulace a klientské nabídky pojištění.

## Moduly

- `/` – firemní úkoly
- `/kalkulace` – nabídky pojištění vozidel
- `/majetek` – editor pojištění nemovitosti, domácnosti a odpovědnosti
- `/nabidka/[slug]` – veřejný klientský výstup bez interní navigace

Majetkový modul používá jeden verzovaný datový model pro obrazovku i třístránkové A4 PDF. Veřejná nabídka je před uložením zašifrovaná pomocí AES-256-GCM. Databáze obsahuje pouze ciphertext; dešifrovací klíč zůstává za `#` v odkazu a do Supabase ani webového serveru se neposílá.

Také pracovní uložení majetkové nabídky v `property_calculations` je šifrované. Klíč zůstává pouze v prohlížeči, ve kterém byla nabídka uložena; bez exportu klíče ji jiné zařízení záměrně neodemkne.

## Lokální spuštění

```bash
npm install
npm run dev
```

Aplikace se otevře na [http://localhost:3000](http://localhost:3000).

## Supabase

Aktuální projekt používá migraci v `supabase/migrations`. Pro vlastní prostředí nastavte:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-key>
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` může obsahovat moderní klíč ve formátu `sb_publishable_…`. Autorizační hranicí zůstávají databázová RLS pravidla; do klienta nikdy nepatří service-role klíč.

Starší moduly zatím používají kompatibilní interní přihlášení v prohlížeči a širší anonymní RLS pravidla. Nejde o plnohodnotnou serverovou autorizaci. Před ukládáním dalších citlivých dat do starších tabulek je potřeba přejít na Supabase Auth a uživatelsky vázané RLS politiky; nový majetkový modul tuto mezeru obchází šifrováním klientských dat ještě před odesláním.

## Kontroly před nasazením

```bash
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

Anonymizovaná referenční nabídka je v `lib/property-offer/reference.ts`. Rozlišuje stavy krytí `included`, `excluded` a `unknown`, aby „neuvedeno“ nebylo zaměněno za výluku. Konkrétní klientské výstupy se do veřejného repozitáře neukládají.

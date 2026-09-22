# Upozornění LIMMIT

Aplikace používá vlastní standardní Web Push. OneSignal SDK se již nenačítá. Historická adresa `OneSignalSDKWorker.js` zůstává kvůli aktualizaci již nainstalovaných aplikací; načítá naše pracovníky pro PWA a upozornění.

## Pravidla doručování

- Nové přidělení úkolu upozorní pouze přiděleného zpracovatele, na všech jeho zapnutých zařízeních.
- Každý den v **8:30 a 14:30 Europe/Prague** přijde jeden souhrn vlastních úkolů po termínu. Letní a zimní čas se mění automaticky. Souhrn nepočítá hotové, odmítnuté, archivované úkoly ani úkoly bez termínu. Pokud není nic po termínu, nic se neposílá. Odevzdané, ale ještě neschválené úkoly zůstávají nedokončené.
- Přechod zpracovatele do **Hotovo** upozorní ostatní zpracovatele téhož úkolu. Při zapnutém schvalování až po schválení. Dokončující člověk nedostane vlastní zprávu; zadavatel nebo majitel ji dostane pouze tehdy, je-li sám dalším zpracovatelem.
- Přijetí úkolu upozorní původního autora úkolu, pokud není sám přijímajícím zpracovatelem.
- Nové aktualizace/komentáře, úpravy zadání, změny stavu, archivace a obnovení upozorní autora a aktuální zpracovatele kromě původce změny. Nově přidaný zpracovatel dostane pouze zprávu o přidělení, bez druhé zprávy o téže úpravě. Přijetí a dokončení používají vlastní výše uvedená pravidla.
- Běžné datum připomenutí v kategorii Dnes nevytváří další plánovaný push.

## Osobní historie pod zvonečkem

Zvoneček **Zprávy** ve společné navigaci zobrazuje počet nepřečtených a osobní historii za posledních 90 dní. Klepnutí označí zprávu jako přečtenou a otevře úkol; hromadné označení přečte zprávy do okamžiku načtení přehledu, takže nepřečte souběžně příchozí nové zprávy. Přehled načítá starší záznamy po stránkách.

Historie se ukládá jednou pro každého příjemce bez ohledu na počet zařízení a funguje i bez povolených push oznámení. Stav přečtení je společný napříč zařízeními. Historie zaznamenává vznik upozornění, nikoli zaručené zobrazení na telefonu. Starší události se doplnily z dosud uchované doručovací fronty, takže období před jejím zavedením nebo již smazané záznamy nelze zpětně doplnit. Zkušební oznámení telefonu se do historie úkolů neukládají.

Historie používá soukromou tabulku `push_private.notifications`, serverový endpoint `/api/notifications` a bránu `task_notification_history`. Relace určuje příjemce; klient neposílá identitu. Název a odkaz úkolu se vrátí jen tehdy, má-li k němu uživatel stále přístup. Souhrny po termínu mají historii také pro uživatele bez odběru push. Změna vyžaduje migraci `task_notification_history`; `db/tests/notification_history.sql` ověřuje příjemce, deduplikaci, přístup, stránkování a přečtení v transakci s rollbackem.

Klepnutí otevře konkrétní úkol, souhrn otevře vlastní přidělené úkoly po termínu napříč projekty. Zamčená obrazovka neobsahuje název úkolu, popis ani klientská data; dokončení uvádí jméno kolegy.

## Zapnutí zaměstnancem

1. Otevřít stávající ikonu LIMMIT na ploše a přihlásit se.
2. V přehledu nebo v **Můj účet → Upozornění** stisknout **Zapnout upozornění** a povolit oznámení.
3. Stisknout **Poslat zkušební upozornění**, zavřít aplikaci a zamknout telefon. Zkouška se odešle až po 10 sekundách, obvykle během nejbližší minuty, nejpozději očekávána do dvou minut.

Na iPhonu je potřeba iOS 16.4+ a spuštění z plochy. Android používá podporovaný prohlížeč, například aktuální Chrome. Aplikace nemusí běžet ani být otevřená. Vypnutý telefon, zakázaná oznámení, Soustředění nebo vynucené zastavení prohlížeče mohou doručení oddálit nebo zastavit. Povolení se váže ke konkrétnímu zařízení a účtu. Odhlášení či odvolání relace odběr vypne; opětovné přihlášení stejného účtu obnoví dříve výslovně zapnutý odběr při otevření přehledu nebo účtu.

## Provozní nastavení

Produkční migrace jsou ve `supabase/migrations`:

- `20260921122809_native_web_push.sql`
- `20260921125124_web_push_settings_filter.sql`
- `20260921125252_assignee_push_digests.sql`
- `20260922072043_task_notification_history.sql`

Pro nové prostředí jednorázově spusťte `node scripts/setup-web-push.mjs keys`. Skript doplní chybějící klíče do ignorovaného `.env.local`, nevypisuje je a již existující pár zachová. Do produkčního Vercelu přeneste stejné čtyři `PUSH_*` proměnné z `.env.example`; soukromý klíč a tajemství pracovníka jsou pouze serverové. Nastaven musí být také stávající `ATTENDANCE_GATEWAY_SECRET` a Supabase připojení.

Po aplikování migrací a nasazení aplikace aktivujte plánovač příkazem:

```sh
node scripts/setup-web-push.mjs configure https://firemni-ukoly.vercel.app
```

Supabase `pg_cron` spouští `push_private.tick()` každou minutu, `pg_net` volá chráněný produkční `/api/push/dispatch`. Fronta funguje nezávisle na prohlížeči uživatele. Souhrny mají 30minutové okno pro zotavení po krátkém výpadku. Unikátní klíč zařízení/datum/čas brání opakovaným souhrnům. Přechodné chyby se opakují s prodlevou (nejvýše 6 pokusů), neplatné odběry 404/410 se vypínají. Starší doručení se po 30 dnech promazávají. Zprávy mohou při výpadku přijít později; provozní čas není záruka přesného času zobrazení telefonem.

Tabulky jsou v soukromém schématu, s RLS a bez přímého přístupu klientů. Identita se ověřuje přes osobní serverovou relaci; prohlížeč neurčuje příjemce. Zkušební zprávu lze poslat pouze vlastnímu odběru, jednou za 30 sekund. Přijetí doručovací službou a potvrzené zobrazení na zařízení se evidují zvlášť.

## Ověření

`node --test tests/web-push.test.mjs` ověřuje povolené služby, šifrovací klíče a pracovníka bez otevřené stránky. `db/tests/web_push.sql` spusťte pouze uvnitř `BEGIN` / `ROLLBACK`; ověřuje příjemce, dokončení, souhrny, oba časy, zimní čas, deduplikaci, autorizaci, frontu, opakování a odhlášení. Testy nesmějí zanechat testovací data nebo odesílat reálné zaměstnanecké zprávy.

Pro kontrolu provozu použijte `cron.job`, `cron.job_run_details` a pouze ne-tajná pole `enabled,last_tick_at,last_worker_at` v `push_private.settings`. Nikdy nevypisujte `worker_token` nebo šifrovací údaje odběrů. Fyzické doručení se ověřuje zkušebním tlačítkem na konkrétním telefonu.

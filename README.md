# Firemní aplikace LIMMIT

Interní Next.js aplikace pro úkoly, kalkulace a klientské nabídky pojištění.

## Moduly

- `/` – firemní úkoly
- `/kalkulace` – nabídky pojištění vozidel
- `/majetek` – editor pojištění nemovitosti, domácnosti a odpovědnosti
- `/nabidka/[slug]` – veřejný klientský výstup bez interní navigace

## Pracovní prostor úkolů

Milan a Viktor mají roli majitele. Každý uživatel může vytvořit vlastní úkol; schvalování je při novém zadání vypnuté a lze jej volitelně zapnout. Jeden úkol může mít více řešitelů. Zadání a diskuse jsou společné, stav dokončení je samostatný pro každého člověka.

Pohledy: Moje úkoly, Zadané mnou, a pro majitele Celý tým i kompletní náhled jednotlivých zaměstnanců. Kategorie oddělují aktivní práci, dnešní termíny a připomenutí, prošlé termíny, kontrolu, hotové úkoly a archiv. K dispozici je seznam i nástěnka, hledání a řazení.

Postup: přijetí → práce → dokončení (případně kontrola majitelem). Čekání, odmítnutí a vrácení vyžadují důvod. U čekání lze nastavit datum dalšího kroku, které se zobrazí v Dnes. Komentáře i změny mají databázový čas; aktualizace zůstávají v historii. Archivování je vratné. Nové rozepsané zadání se uchovává v sessionStorage daného uživatele; při chybě zápisu formulář zůstává otevřený.

Datový upgrade je v `supabase/migrations/20260909113842_task_workspace.sql`: zachovává původní úkoly, převádí řešitele a staré poznámky do tabulek `task_assignments` a `task_updates`. Změny probíhají atomicky přes `task_workspace`; změna stavu ověřuje očekávaný původní stav. Regresní ověření v `db/tests/task_workspace.sql` běží celé v transakci ukončené ROLLBACK.

PWA používá ikony LIMMIT, manifest, vlastní Web Push a samostatnou offline obrazovku. Na mobilu je navigace dole a instalace je dostupná tlačítkem se šipkou. Offline se nedají ukládat změny; service worker necachuje úkoly ani klientská data. Instalace na vzdáleném zařízení vyžaduje HTTPS (localhost je výjimka). Nové úkoly upozorňují přidělené zpracovatele; dokončení upozorní ostatní zpracovatele stejného úkolu. Každý den v 8:30 a 14:30 českého času přijde jeden souhrn vlastních úkolů po termínu, pokud nějaké jsou. Server odesílá i při zavřené aplikaci. Zapnutí na zařízení a provozní postup jsou v [PUSH_SETUP.md](PUSH_SETUP.md).

Stávající interní přihlášení a kompatibilní anonymní databázový přístup zatím zůstávají. Kontroly role a předaného jména ve workflow nejsou náhradou za ověřenou identitu: pro přístup z nedůvěryhodného prostředí je nutná migrace na skutečné ověřování uživatelů a odpovídající RLS. Tato změna nerozšiřuje přístup k šifrovaným nabídkám.

Majetkový modul používá jeden verzovaný datový model pro obrazovku i třístránkové A4 PDF. Veřejná nabídka je před uložením zašifrovaná pomocí AES-256-GCM. Databáze obsahuje pouze ciphertext; dešifrovací klíč zůstává za `#` v odkazu a do Supabase ani webového serveru se neposílá.

Také pracovní uložení majetkové nabídky v `property_calculations` je šifrované. Klíč zůstává pouze v prohlížeči, ve kterém byla nabídka uložena; bez exportu klíče ji jiné zařízení záměrně neodemkne.

## Lokální spuštění

Zvoneček **Zprávy** v navigaci obsahuje osobní historii upozornění za 90 dní a počet nepřečtených. Záznamy i přečtení jsou společné pro všechna zařízení a vznikají také při vypnutých push oznámeních. Přijetí úkolu upozorní původního autora; aktualizace, změny zadání a stavu informují autora a zpracovatele kromě původce změny. Dokončení nadále upozorňuje pouze ostatní zpracovatele. Podrobnosti a ověření jsou v [PUSH_SETUP.md](PUSH_SETUP.md).

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


## Docházka a přítomnost

`/dochazka` obsahuje vlastní i majitelský týmový přehled; `/absence` je samostatný přehled pro majitele. Viktor i Milan jsou majitelé. Přihlášení a odhlášení od práce vytvářejí samostatné úseky s časem serveru, opakovaně v jednom dni. Zavření prohlížeče ani odhlášení účtu není odchod od PC; zaměstnanec musí použít tlačítko „Končím / odcházím od PC“. Neuzavřený minulý úsek je označený „Chybí odhlášení“. Jde o ručně potvrzenou přítomnost, nikoli sledování aktivity počítače. Otevřený úsek pokrývá pracovní okno, ale bez odhlášení není jeho skutečná délka ověřená.

Pracovní okno začíná v 8:30 Europe/Prague. Karina a Vendula mají 7 hodin (do 15:30), ostatní 9 hodin (do 17:30). Absence je sjednocení nepokrytých intervalů od 8:30 do aktuálního času, nejvýše do konce pracovního okna. Zaznamenané osobní volno a schválená dovolená se nezapočítávají. Výpočet se provádí na serveru z uložených plánů a úseků i pro minulé dny; otevřená aplikace ani plánovač nejsou nutné. Majitel vyžádá omluvenku, zaměstnanec ji doplní a majitel omluví nebo zamítne s důvodem. Vlastní žádost ani omluvenku majitel neschvaluje sám.

Dovolená: 20 pracovních dnů na kalendářní rok, české svátky a víkendy se neodečítají. Čekající žádosti rezervují nárok, přelom roku se počítá odděleně. Osobní volno je neomezený povinný záznam jednoho dne a času od–do, bez schvalování. Home office se zadává kdykoliv, včetně aktuálního týdne, bez limitu čtyř dnů. Tlačítko vedle osobního volna otevře volbu data a pracovních dnů týdne. Přehled pravidel je skrytý.

Migrace `20260909122617_attendance_workspace.sql` a `20260909122930_attendance_personal_hours.sql` vytvářejí soukromé tabulky. Serverová brána vyžaduje `ATTENDANCE_GATEWAY_SECRET` (náhodný klíč alespoň 32 bytů); jeho SHA-256 otisk je v `attendance_private.settings.gateway_hash`. API ověřuje odvolatelnou databázovou relaci z HttpOnly cookie. Osobní hesla jsou hashovaná v `attendance_private.accounts`; společné heslo se již nepoužívá. Tajné hodnoty nepatří do `NEXT_PUBLIC_*`, migrací ani repozitáře.

Od 21. 9. 2026 má každý osobní heslo. Docházka, nástěnka i změny úkolů kontrolují serverovou relaci; staré cookie neplatí. Starší přímé databázové přístupy pojistných modulů nejsou touto změnou kompletně přepracované.

`db/tests/attendance.sql` ověřuje limity, svátky, intervaly příchodů/odchodů, osobní volno, oprávnění a schvalování v transakci ukončené ROLLBACK. Databázové testy nezanechávají testovací docházku.


Majitel po otevření docházky automaticky uvidí dashboard „Tento týden“, tlačítko „Příští týden“ přepíná výhled. Týdenní souhrny a matice zaměstnanců zahrnují home office, schválenou/čekající dovolenou i osobní volno s časem. Dnešní přítomnost zůstává pouze u aktuálního týdne. Rozkliknutí jména otevře pracovní úseky daného člověka. Přepnutí na vlastní docházku je zachované. Migrace `20260909124941_attendance_week_outlook.sql` načítá výhled nezávisle na ročním filtru, včetně přelomu roku.

Bezpečnostní kontrola Supabase u docházky hlásí pouze [RLS bez přístupových politik](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): záměrně uzavřené soukromé tabulky, přístupné jen ověřenou serverovou bránou. Starší majetkové RPC mají dosavadní [upozornění na veřejně volatelné SECURITY DEFINER funkce](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable); změny docházky jejich oprávnění neupravují.
Zaměstnanci mají stejný přepínač aktuálního a příštího týdne pouze pro vlastní docházku. Na mobilu se vlastní týden skládá do karet jednotlivých dnů; týmový přehled má posuvnou tabulku.


## Vyřízení omluvenek, hodinová dovolená a upozornění

Dovolená se eviduje v minutách a zobrazuje v hodinách: Karina a Vendula 140 h ročně, ostatní 180 h. Celodenní žádost rezervuje 7 nebo 9 h podle pracovní doby. Majitel může místo běžného schválení odečíst délku absence z dovolené za rok dané absence. Zůstatek zahrnuje schválené dovolené, čekající žádosti i odečty; záporný zůstatek a dvojí odečet jsou odmítnuté. Odečet může jiný majitel vrátit s důvodem, audit zůstává.

Běžné schválení omluvenky vytvoří osobní volno pro každý nepokrytý pracovní interval. Pracovní úseky ani již zadané volno se nepočítají podruhé. Schválená omluvenka zůstává v přehledu vyřízených případů, odkazy na osobní volno umožňují její vrácení majitelem. Automaticky vzniklé osobní volno se ruší přes původní omluvenku. Převod i odečet celé denní absence se dokončují až po konci pracovní doby daného dne, aby délka absence byla konečná.

Součet osobního volna se ořezává na pracovní okno a počítá za kalendářní rok. Nad 5 pracovních dní (35 h u Kariny a Venduly, 45 h u ostatních) se v docházce zobrazuje trvalé upozornění dotčenému zaměstnanci a oběma majitelům, i když mají otevřenou vlastní docházku. Nejde o push zprávu mimo aplikaci. Přesně pět dní upozornění nevyvolá. Od ledna začíná nový součet; historie předchozího roku zůstává. `db/tests/attendance_settlement.sql` ověřuje přesné intervaly, limity, nedostatek dovolené, opakování, vrácení a oddělení let v rollback transakci.

Karina a Vendula mají omezený zaměstnanecký pohled: API jim neposílá pracovní úseky, první příchody, historii událostí ani délky absencí. Dostávají jen aktuální stav přihlášeno/odhlášeno a nevyřízené žádosti o omluvenku bez časového rozpisu. Automaticky vzniklé osobní volno nezobrazuje původní časy nepřítomnosti. Majitelé mají denní souhrn odpracovaného času v pracovním okně, plánu 7/9 hodin a zbývající neomluvené absence. Z něj mohou vyžádat omluvenku, po skončení pracovní doby převést absenci na osobní volno i bez předchozího podání, nebo odečíst dovolenou. Neuzavřené přihlášení je označené jako nepotvrzený čas.

## Nástěnka úkolů a vlastní sloupce

Řešitelé se vybírají v rozbalovacím poli s vyhledáváním; lze vybrat více lidí. V konkrétním projektu lze nový úkol založit přímo tlačítkem v příslušném sloupci. Sloupce projektu jsou společné organizační sekce pro jeho členy. Při odstranění sloupce musí uživatel vybrat cílový sloupec pro všechny úkoly, včetně těch skrytých filtrem. Úkoly se nemažou. Stav jednotlivých řešitelů a schvalování zůstávají samostatně na kartě a v detailu.

Úchyt na kartě přesouvá úkol mezi sloupci i v rámci jejich ručního pořadí; úchyt v záhlaví řadí sloupce. Na dotykovém zařízení se úchyt krátce podrží. Klávesnice používá mezerník, šipky a mezerník pro dokončení, Escape pro zrušení. Alternativou je výběr cílového sloupce na kartě a přesuny vlevo/vpravo v nabídce sloupce.

„Řazení úkolů“ je dostupné na nástěnce, v seznamu i kalendáři: termín od nejbližšího / nejvzdálenějšího, datum vytvoření od nejnovějšího / nejstaršího a priorita. Úkoly bez termínu zůstávají při řazení podle termínu poslední. Nástěnka řadí uvnitř sloupců; při automatickém řazení lze úkoly dál přesouvat mezi sloupci. Volba „Ruční pořadí“ obnoví uložené pořadí karet. Kalendář řadí úkoly uvnitř jednotlivých dnů a skupinu bez termínu. Volba se pamatuje v prohlížeči zvlášť pro uživatele, projekt nebo týmový pohled, kategorii a typ zobrazení; nemění pořadí kolegům. Regresní testy: `node --test tests/task-sorting.test.mjs`.

Pořadí ukládá soukromé schéma task_board_private přes serverové /api/task-board, podepsanou přihlašovací cookie a stávající tajný klíč docházky. Zaměstnanec přesouvá úkoly, které vytvořil nebo řeší; společné sloupce spravují majitelé. Kontrola revize odmítne zastaralý přesun a obnoví aktuální nástěnku. Nový úkol i jeho umístění vznikají v jedné transakci. Starší operace nad obsahem úkolů nadále používají dosavadní RPC. Test db/tests/task_board.sql ověřuje oprávnění, pořadí, souběžné změny a zachování úkolů v transakci s rollbackem.

Bezpečnostní aktualizace z 10. 9. 2026: Next.js a eslint-config-next 16.3.4, PostCSS 8.5.28 a opravené tranzitivní závislosti v package-lock.json. Úplný npm audit (včetně vývojových závislostí) po aktualizaci hlásí 0 známých zranitelností. Produkční sestavení a cílená kontrola ESLint prošly.

## Osobní projekty a kalendář úkolů

Každý člen týmu může přes „Nový projekt“ založit vlastní projekt. Projekt má samostatné sloupce, pořadí a revizi; jeho autor upravuje názvy, přidává, odebírá a řadí sloupce. Majitel může zobrazit projekty zaměstnanců. Viktor může spravovat všechny projekty; Milan upravuje cizí nástěnku jako člen projektu. Výběr projektu se pamatuje pro konkrétní účet v prohlížeči.

„Všechny úkoly“ jsou automatický přehled: každý sloupec nástěnky představuje dostupný projekt, poslední sloupec „Bez projektu“ obsahuje úkoly bez dostupného zařazení. Úkol v několika projektech se ukáže v každém příslušném sloupci; souhrny počítají unikátní úkoly. Kliknutí na záhlaví otevře projekt. Tento přehled nemá přetahování, vlastní sloupce ani ruční pořadí; API odmítá přímé úpravy původní globální nástěnky. Řazení podle termínu, data vytvoření a priority dál funguje. Úkoly lze otevírat a upravovat podle dosavadních oprávnění. Při volbě „Bez projektu“ v editoru se žádný další sloupec nevybírá.

V každém projektu přepínač „Jen moje úkoly“ filtruje podle přihlášeného řešitele a používá také jeho stav dokončení, připomenutí a schvalování. Platí pro nástěnku, seznam, kalendář i souhrnné počty. Volba se pamatuje v prohlížeči zvlášť pro účet a projekt a nemění kolegům zařazení ani zobrazení. Testy přehledu a blokování úprav: `node --test tests/project-overview.test.mjs`.

Projekt může obsahovat nový i již existující úkol. Jeden úkol lze zařadit do více osobních projektů; jeho obsah a řešitelé jsou společné, umístění v projektech je nezávislé. Autor vybírá dostupné vlastní nebo přidělené úkoly; majitel má přístup k týmovým úkolům. Sloupce a umístění ukládá soukromé schéma task_board_private přes serverovou autorizaci; přímý přístup anonymních klientů je zakázaný. SQL test db/tests/task_projects.sql ověřuje oddělení projektů, oprávnění, revize a zachování sdílených úkolů.

Pohled „Kalendář“ zobrazuje filtrované úkoly podle termínu. Nabízí předchozí/příští měsíc, návrat na dnešek, detail úkolu a založení úkolu s předvyplněným dnem. Úkoly bez termínu jsou pod kalendářem. Na telefonu nástěnka používá vodorovné posouvání s dosednutím na jednotlivé sloupce; při přetahování karet se dosedávání dočasně vypne.

Projekty mají vlastní barvu (volba při vytvoření a přes „Upravit projekt“). Karty a kalendář zobrazují barevné štítky všech dostupných projektů úkolu. Vlastní projekty zahrnují i úkoly zadané kolegům. Jeden sdílený úkol se vykreslí pouze jednou. Změna projektu ruší předchozí hledání a přepíná na aktivní úkoly; přepnutí mezi nástěnkou, seznamem a kalendářem zachovává vybranou kategorii.

Hlavní kategorie jsou nyní Aktivní, Dnes, Po termínu, Ke schválení a Hotovo / Archiv. Dokončené i archivované úkoly jsou viditelné pouze v poslední kategorii; dokončení nemění archived_at a zachovává stav jednotlivých řešitelů. Kategorie platí stejně pro nástěnku, seznam i kalendář a při přepnutí pohledu zůstává vybraná. Úspěšný přechod řešitele do DONE spustí krátkou animaci dvou přiťukávajících skleniček; odeslání ke schválení ani neúspěšný zápis ji nespouští. Při omezeném pohybu v systému se zobrazí statické potvrzení.

## Schránka přidělených úkolů

Projekty nyní podporují více členů. Zakladatel vybírá kolegy při vytvoření nebo přes „Upravit projekt“ a zůstává správcem názvu, barvy a členství. Členové vidí projekt ve svém přehledu, upravují společné sloupce, přidávají a přesouvají úkoly a komentují je. Členství samo nemění řešitele ani oprávnění dokončit cizí úkol. Odebírání člena zachová projekt i úkoly; přístup získaný samostatným přidělením úkolu zůstává. Majitelé mají nadále přehled všech projektů. Viktor může upravovat i cizí projekty bez členství; Milan potřebuje pro úpravy cizí nástěnky členství. Schránka umožňuje přijetí také do sdíleného projektu. Migrace `20260916061142_shared_project_members.sql`; oprávnění a odebrání členství ověřuje rollback test `db/tests/shared_projects.sql`. Komentáře zachovávají dosavadní model legacy RPC podle jména autora; nejde o migraci celého úkolového API na osobní autentizaci.

Viktor s rolí majitele může přes „Upravit projekt“ měnit název, barvu, členy i nástěnku každého projektu. Pouze Viktor má „Smazat projekt“ s potvrzovacím dialogem. Smazání odstraní projekt, jeho sloupce a zařazení úkolů, ale zachová samotné úkoly, řešitele, komentáře, historii i zařazení v ostatních projektech. Původní zakladatel projektu se při úpravách nemění. Databáze kontroluje oprávnění a aktuální revizi; oprávnění vrací v `can_manage_project` a `can_delete_project`. Migrace `20260922072117_viktor_project_management.sql`; regresní ověření `db/tests/viktor_projects.sql` běží s rollbackem.

Výrazná schránka nad přehledem počítá nearchivované úkoly čekající na přijetí od ostatních lidí, nezávisle na aktuálním projektu a filtrech. Úkol přidělený sám sobě do ní nevstupuje. Příjemce při přijetí vybere vlastní projekt a jeho sloupec; přímo ve schránce může založit nový projekt. Každý řešitel sdíleného úkolu jej přijímá a zařazuje samostatně.

Při vytváření úkolu každý vybírá svůj nebo sdílený projekt a jeho sloupec přímo ve formuláři; výběr se zachovává i v rozepsaném návrhu. Příjemci zůstává samostatný výběr při přijetí. V editaci lze měnit projekt i sloupec; přesun odstraní pouze právě upravované původní zařazení a zachová ostatní projekty úkolu. Přijatý řešitel může přes „Upravit moje zařazení“ měnit umístění bez oprávnění upravovat společné zadání. Ve sdíleném projektu má úkol jeden společný sloupec pro všechny členy. Obsah a umístění se ukládají společně; neplatný sloupec, chybějící oprávnění nebo zastaralá revize neuloží ani část změn. Migrace `20260922084433_personal_task_locations.sql`; ověření `db/tests/task_editor_placement.sql` běží s rollbackem a `tests/task-placement-permissions.test.mjs` kontroluje dostupnost editace zařazení.

Migrace `20260914134605_task_inbox_acceptance.sql` ukládá skutečného zadavatele přidělení do `assigned_by`; u starších přidělení doplní původního autora úkolu. Serverová akce `accept_task` ověřuje příjemce, vlastnictví projektu, cílový sloupec a revizi. Přijetí a umístění proběhnou v jedné transakci, takže při chybě úkol zůstane čekající. `db/tests/task_inbox.sql` ověřuje oprávnění, umístění, opakované přijetí a zachování čekajícího stavu při chybě v transakci s rollbackem.

Viktor má v týmové docházce tlačítko Nastavit volno kolegovi: termín dovolené (rovnou schválený), týdenní home office, osobní volno i absolutní zůstatek dovolené pro zvolený rok. API a databáze ověřují Viktorův účet a roli majitele; historie rozlišuje autora a dotčeného kolegu. Vlastní dovolená zůstává žádostí. Regresní test db/tests/attendance_team_leave.sql běží v rollback transakci.

Dovolená se zobrazuje ve dnech. Každý může požádat o dopolední nebo odpolední půlden; Viktor jej může zadat za kolegu. Půlden je jediný pracovní den, časy odvozuje server z úvazku (7/9 h), odečítá se 0,5 dne a absence se omlouvá jen ve vybraném intervalu. Zbytek dne umožňuje home office. Test db/tests/attendance_half_day.sql ověřuje oba úvazky, oprávnění, překryvy, storno a rezervace v rollback transakci.

## Osobní účty a přihlášená zařízení
Od 21. 9. 2026 se přihlášení ověřuje proti osobním bcrypt hashům v soukromé tabulce accounts. Náhodné relace jsou v databázi uloženy pouze jako SHA-256 otisk; platnost je 7 dnů a odvolání se kontroluje na serveru. Staré sdílené heslo ani podepsané cookie neplatí. /ucet zobrazuje vlastní přihlášení; Viktor vidí celý tým, odhlašuje jednotlivé nebo všechny relace a resetuje hesla. Změna hesla odvolá všechny relace dotčeného uživatele. Přehled obsahuje user-agent, IP při přihlášení a poslední kontakt s aplikací; nejde o sledování jiných aplikací ani identifikaci fyzického zařízení. Stránky kontrolují relaci každých 30 sekund i při návratu do okna. Databázová brána omezuje pokusy o přihlášení (10 na účet a 60 na IP za 15 minut). Hesla ani tokeny se nezapisují do auditu. Test db/tests/account_sessions.sql běží v rollback transakci. Export vygenerovaných hesel je mimo repozitář.

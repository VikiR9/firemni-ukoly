# Klíče upozornění

Aktuální postup je v [PUSH_SETUP.md](PUSH_SETUP.md). Od 21. 9. 2026 se používají proměnné `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_VAPID_SUBJECT` a `PUSH_WORKER_SECRET`.

Soukromé klíče nepatří do dokumentace ani Gitu. Dříve zveřejněné historické klíče se pro nové odesílání nepoužívají. Nový pár zůstává v ignorovaném `.env.local` a v produkčních proměnných Vercelu. Při běžném nasazení klíče neměňte: jejich změna vyžaduje nové povolení odběru na každém zařízení.

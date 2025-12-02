"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/auth";

// --- ICONS (Lucide-style SVG icons) ---
const icons = {
  shield: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  car: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.6-1.2-.9-2-.9H5c-.8 0-1.6.4-2.1 1.1L1 10v6c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
  ),
  user: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  ),
  check: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  edit: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  ),
  fileText: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
  ),
  printer: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
  ),
  info: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  ),
  save: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
  ),
  mail: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
  ),
  copy: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  ),
  checkCircle: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  ),
  plus: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  ),
  trash: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
  ),
  x: (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  ),
  settings: (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  ),
  refresh: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
  ),
};

const INSURERS = [
  "Allianz pojišťovna, a.s.",
  "Česká podnikatelská pojišťovna, a.s.",
  "ČSOB Pojišťovna, a. s.",
  "Direct pojišťovna, a.s.",
  "Generali Česká pojišťovna a.s.",
  "Kooperativa pojišťovna, a.s.",
  "Pillow pojišťovna, a.s.",
  "Pojišťovna VZP, a.s.",
  "Slavia pojišťovna a.s.",
  "UNIQA pojišťovna, a.s.",
];

type ClientData = {
  name: string;
  address: string;
  car: string;
  carValue: string;
  brokerName: string;
  brokerPhone: string;
  brokerEmail: string;
};

type ModuleType = {
  id: string;
  name: string;
};

type Module = {
  active: boolean;
  price: number;
  limit: string;
};

type Offer = {
  id: number;
  insurer: string;
  title: string;
  liability: {
    active: boolean;
    limit: string;
    price: number;
  };
  allrisk: {
    active: boolean;
    limit: number;
    pct: number;
    min: number;
    price: number;
  };
  modules: Record<string, Module>;
  selected: boolean;
};

type Notification = {
  msg: string;
  type: "success" | "error" | "info";
};

export default function KalkulacePage() {
  const router = useRouter();

  // Auth check
  useEffect(() => {
    const user = loadSession();
    if (!user) {
      router.push("/login");
    }
  }, [router]);

  // --- STATE ---
  const [clientData, setClientData] = useState<ClientData>({
    name: "",
    address: "",
    car: "",
    carValue: "",
    brokerName: "Bc. Miloš Weber",
    brokerPhone: "777 557 253",
    brokerEmail: "milos.weber@limmit.cz",
  });

  const [moduleTypes, setModuleTypes] = useState<ModuleType[]>([
    { id: "m_glass", name: "Skla" },
    { id: "m_assist", name: "Asistence" },
    { id: "m_accident", name: "Úraz" },
    { id: "m_luggage", name: "Zavazadla" },
    { id: "m_gap", name: "GAP" },
  ]);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [isEditing, setIsEditing] = useState(true);
  const [activeTab, setActiveTab] = useState<"offer" | "preview">("offer");
  const [notification, setNotification] = useState<Notification | null>(null);
  const [newModuleTypeName, setNewModuleTypeName] = useState("");

  // --- HELPERS ---
  const showNotification = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const formatCurrency = (value: string | number | undefined | null): string => {
    if (value === undefined || value === null || value === "") return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "-";
    return new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: "CZK",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const calculateTotal = useCallback((offer: Offer): number => {
    let total = 0;
    if (offer.liability.active) total += Number(offer.liability.price || 0);
    if (offer.allrisk.active) total += Number(offer.allrisk.price || 0);
    Object.keys(offer.modules || {}).forEach((key) => {
      const m = offer.modules[key];
      if (m?.active) total += Number(m.price || 0);
    });
    return total;
  }, []);

  const createEmptyOffer = useCallback((id?: number, title?: string): Offer => ({
    id: id || Date.now(),
    insurer: INSURERS[0],
    title: title || "Nová varianta",
    liability: { active: true, limit: "35", price: 0 },
    allrisk: { active: true, limit: 0, pct: 5, min: 5000, price: 0 },
    modules: {},
    selected: false,
  }), []);

  // --- INITIALIZATION & PERSISTENCE ---
  useEffect(() => {
    const saved = localStorage.getItem("limmit_data_v4");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setClientData(data.clientData);
        setModuleTypes(data.moduleTypes);
        setOffers(data.offers);
        setIsEditing(false);
        showNotification("Data byla obnovena z paměti.");
      } catch (e) {
        console.error("Load error", e);
        handleNewCalculation();
      }
    } else {
      handleNewCalculation();
    }
  }, [showNotification]);

  // Auto-save
  useEffect(() => {
    if (offers.length > 0) {
      const data = { clientData, moduleTypes, offers, timestamp: Date.now() };
      localStorage.setItem("limmit_data_v4", JSON.stringify(data));
    }
  }, [clientData, moduleTypes, offers]);

  // --- ACTIONS ---
  const handleNewCalculation = () => {
    if (offers.length > 0 && !confirm("Opravdu chcete začít novou kalkulaci? Všechna data budou vymazána.")) {
      return;
    }
    setClientData((prev) => ({ ...prev, name: "", address: "", car: "", carValue: "" }));
    setOffers([createEmptyOffer(1, "Varianta A"), createEmptyOffer(2, "Varianta B")]);
    setIsEditing(true);
    setActiveTab("offer");
    showNotification("Nová kalkulace připravena.");
  };

  const addOffer = () => setOffers((prev) => [...prev, createEmptyOffer(Date.now(), `Varianta ${prev.length + 1}`)]);

  const removeOffer = (id: number) => {
    if (offers.length <= 1) return showNotification("Musí zůstat alespoň jedna varianta.", "error");
    setOffers((prev) => prev.filter((o) => o.id !== id));
  };

  const handleOfferChange = (id: number, section: string, field: string, value: any) => {
    setOffers((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        if (section === "root") return { ...o, [field]: value };
        return { ...o, [section]: { ...(o as any)[section], [field]: value } };
      })
    );
  };

  // Module Logic
  const addModuleType = () => {
    if (!newModuleTypeName.trim()) return;
    setModuleTypes((prev) => [...prev, { id: "m_" + Date.now(), name: newModuleTypeName }]);
    setNewModuleTypeName("");
  };

  const removeModuleType = (id: string) => setModuleTypes((prev) => prev.filter((m) => m.id !== id));

  const handleModuleChange = (offerId: number, modId: string, field: string, value?: any) => {
    setOffers((prev) =>
      prev.map((o) => {
        if (o.id !== offerId) return o;
        const current = o.modules[modId] || { active: false, price: 0, limit: "" };

        let updated = { ...current };
        if (field === "active") updated = { ...updated, active: !updated.active };
        else updated = { ...updated, [field]: value };

        return { ...o, modules: { ...o.modules, [modId]: updated } };
      })
    );
  };

  // --- EXPORT LOGIC ---
  const buildEmailText = (selectedOffer: Offer): string => {
    const offersText = offers
      .map((o) => {
        const total = calculateTotal(o);
        const parts: string[] = [];
        parts.push(`${o.title} - ${o.insurer}`);
        if (o.liability.active) parts.push(`POV: ${o.liability.limit} mil.`);
        if (o.allrisk.active) parts.push(`Havarijní: ${o.allrisk.pct}% / min ${o.allrisk.min} Kč`);
        const modules = Object.entries(o.modules || {})
          .filter(([, m]) => m.active)
          .map(([key, m]) => {
            const moduleType = moduleTypes.find((t) => t.id === key);
            const label = moduleType?.name || "Připojištění";
            return `${label} ${m.limit || ""} ${formatCurrency(m.price)}`.trim();
          });
        if (modules.length) parts.push(`Připojištění: ${modules.join("; ")}`);
        parts.push(`Cena: ${formatCurrency(total)}/rok`);
        return `- ${parts.join(" | ")}`;
      })
      .join("\n");

    return `Dobrý den,

zasílám Vám nabídku pojištění pro vozidlo ${clientData.car || ""}.

KLIENT: ${clientData.name || ""}
${clientData.address ? `ADRESA: ${clientData.address}` : ""}
${clientData.carValue ? `POJISTNÁ ČÁSTKA: ${formatCurrency(clientData.carValue)}` : ""}

PŘEHLED VARIANT:
${offersText}

DOPORUČENÁ VARIANTA: ${selectedOffer.insurer}, ${formatCurrency(calculateTotal(selectedOffer))}/rok.

V příloze naleznete PDF dokument s kompletním přehledem na jedné stránce A4.

S pozdravem,

${clientData.brokerName}
Pojišťovací specialista
Tel: ${clientData.brokerPhone}
E-mail: ${clientData.brokerEmail}

--
LIMMIT Insurance Solutions`;
  };

  const sendEmail = async () => {
    const selectedOffer = offers.find((o) => o.selected) || offers[0];
    if (!selectedOffer) {
      showNotification("Chybí data nabídek pro export.", "error");
      return;
    }

    const subject = `Nabídka pojištění - ${clientData.name || clientData.car || "Klient"}`;
    const textBody = buildEmailText(selectedOffer);

    const mailtoBody = textBody + "\n\n---\nPoznámka: Pro PDF dokument použijte tlačítko Stáhnout PDF.";
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailtoBody)}`;
    window.location.href = mailtoUrl;

    showNotification("Otevírám e-mailového klienta.", "info");
  };

  const copyEmailText = async () => {
    const selectedOffer = offers.find((o) => o.selected) || offers[0];
    if (!selectedOffer) {
      showNotification("Chybí data nabídek.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildEmailText(selectedOffer));
      showNotification("Text emailu zkopírován do schránky.", "success");
    } catch {
      showNotification("Kopírování se nezdařilo.", "error");
    }
  };

  // --- UI ---
  return (
    <div className="min-h-screen font-sans bg-zinc-900 text-white">
      {/* NOTIFICATION */}
      {notification && (
        <div
          className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-xl shadow-2xl text-white flex items-center gap-3 font-medium animate-fade-in ${
            notification.type === "error"
              ? "bg-red-500"
              : notification.type === "info"
              ? "bg-blue-500"
              : "bg-green-600"
          }`}
        >
          {icons.checkCircle}
          {notification.msg}
        </div>
      )}

      {/* APP HEADER */}
      <header className="bg-[#1a1a5c] text-white sticky top-0 z-40 shadow-lg border-b border-blue-900">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="text-xl font-bold">LIMMIT</div>
            <div className="h-6 w-px bg-blue-800"></div>
            <h1 className="text-lg font-bold tracking-wide">Kalkulátor pojištění</h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleNewCalculation}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-100 hover:bg-red-500/20 hover:text-white transition-all text-sm font-medium"
            >
              {icons.refresh} Nová kalkulace
            </button>
            <div className="h-8 w-px bg-blue-800 mx-1"></div>
            <button
              onClick={() => setActiveTab("offer")}
              className={`px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center gap-2 ${
                activeTab === "offer"
                  ? "bg-[#009ee3] text-white shadow-md transform scale-105"
                  : "text-blue-200 hover:bg-white/5"
              }`}
            >
              {icons.edit} Editace
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center gap-2 ${
                activeTab === "preview"
                  ? "bg-[#009ee3] text-white shadow-md transform scale-105"
                  : "text-blue-200 hover:bg-white/5"
              }`}
            >
              {icons.printer} Náhled & Export
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6">
        {/* CLIENT FORM */}
        <div className="bg-zinc-800 rounded-2xl shadow-sm border border-zinc-700 p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {icons.user} Údaje o klientovi
            </h2>
            <button onClick={() => setIsEditing(!isEditing)} className="text-[#009ee3] text-sm font-semibold hover:underline">
              {isEditing ? "Ukončit úpravy" : "Upravit údaje"}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Jméno a Příjmení</label>
              {isEditing ? (
                <input
                  value={clientData.name}
                  onChange={(e) => setClientData({ ...clientData, name: e.target.value })}
                  className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded focus:ring-2 focus:ring-blue-500 outline-none font-medium text-white"
                />
              ) : (
                <p className="text-lg font-semibold text-white">{clientData.name || "-"}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Vozidlo</label>
              {isEditing ? (
                <input
                  value={clientData.car}
                  onChange={(e) => setClientData({ ...clientData, car: e.target.value })}
                  className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded focus:ring-2 focus:ring-blue-500 outline-none font-medium text-white"
                />
              ) : (
                <p className="text-lg font-semibold text-white">{clientData.car || "-"}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Pojistná částka</label>
              {isEditing ? (
                <input
                  type="number"
                  value={clientData.carValue}
                  onChange={(e) => setClientData({ ...clientData, carValue: e.target.value })}
                  className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded focus:ring-2 focus:ring-blue-500 outline-none font-medium text-white"
                  placeholder="Kč"
                />
              ) : (
                <p className="text-lg font-bold text-[#009ee3]">{formatCurrency(clientData.carValue)}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Adresa</label>
              {isEditing ? (
                <input
                  value={clientData.address}
                  onChange={(e) => setClientData({ ...clientData, address: e.target.value })}
                  className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded focus:ring-2 focus:ring-blue-500 outline-none font-medium text-white"
                />
              ) : (
                <p className="text-base text-gray-300">{clientData.address || "-"}</p>
              )}
            </div>
          </div>
        </div>

        {/* EDITOR TAB */}
        {activeTab === "offer" && (
          <div className="animate-fade-in">
            {isEditing && (
              <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 mb-8 flex flex-wrap items-center gap-4">
                <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                  {icons.settings} Globální připojištění:
                </span>
                {moduleTypes.map((t) => (
                  <span key={t.id} className="bg-zinc-700 px-3 py-1 rounded-full text-sm border border-zinc-600 flex items-center gap-2 shadow-sm">
                    {t.name}
                    <button onClick={() => removeModuleType(t.id)} className="text-gray-400 hover:text-red-500">
                      {icons.x}
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-2 ml-auto">
                  <input
                    value={newModuleTypeName}
                    onChange={(e) => setNewModuleTypeName(e.target.value)}
                    placeholder="Název..."
                    className="p-1.5 px-3 text-sm border border-zinc-600 bg-zinc-700 rounded-lg outline-none w-40 focus:ring-2 focus:ring-blue-400 text-white"
                    onKeyDown={(e) => e.key === "Enter" && addModuleType()}
                  />
                  <button onClick={addModuleType} className="bg-zinc-700 p-1.5 border border-zinc-600 rounded-lg hover:bg-zinc-600 text-[#009ee3]">
                    {icons.plus}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Kalkulace variant</h2>
              {isEditing && (
                <button onClick={addOffer} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shadow-md flex items-center gap-2 text-sm font-medium">
                  {icons.plus} Přidat variantu
                </button>
              )}
            </div>

            <div className="flex gap-6 overflow-x-auto pb-10 items-start snap-x">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className={`snap-center shrink-0 w-full md:w-[400px] bg-zinc-800 rounded-2xl shadow-lg border-t-4 flex flex-col relative transition-all ${
                    offer.selected ? "border-[#009ee3] ring-4 ring-blue-900/50 scale-[1.01]" : "border-zinc-600"
                  }`}
                >
                  {isEditing && (
                    <button onClick={() => removeOffer(offer.id)} className="absolute top-3 right-3 text-gray-400 hover:text-red-500 p-1 z-10">
                      {icons.trash}
                    </button>
                  )}

                  {/* HEADER */}
                  <div className="p-6 border-b border-zinc-700 bg-zinc-900/50 rounded-t-xl">
                    {isEditing ? (
                      <>
                        <select
                          value={offer.insurer}
                          onChange={(e) => handleOfferChange(offer.id, "root", "insurer", e.target.value)}
                          className="w-full p-2 mb-2 border border-zinc-600 bg-zinc-700 rounded font-bold text-white"
                        >
                          {INSURERS.map((i) => (
                            <option key={i} value={i}>
                              {i}
                            </option>
                          ))}
                        </select>
                        <input
                          value={offer.title}
                          onChange={(e) => handleOfferChange(offer.id, "root", "title", e.target.value)}
                          className="w-1/2 text-sm bg-transparent border-b border-dashed border-zinc-600 outline-none text-gray-400"
                        />
                      </>
                    ) : (
                      <>
                        <h3 className="text-xl font-bold text-white mb-1">{offer.insurer}</h3>
                        <p className="text-sm text-gray-400">{offer.title}</p>
                      </>
                    )}
                    <div className="text-right mt-2">
                      <div className="text-3xl font-bold text-[#009ee3]">{formatCurrency(calculateTotal(offer))}</div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ročně</div>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* LIABILITY */}
                    <div
                      className={`p-4 rounded-xl border transition-colors ${
                        offer.liability.active ? "bg-blue-900/20 border-blue-700" : "bg-zinc-900/50 border-zinc-700 opacity-60"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          {isEditing && (
                            <input
                              type="checkbox"
                              checked={offer.liability.active}
                              onChange={() => handleOfferChange(offer.id, "liability", "active", !offer.liability.active)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                          )}
                          <span className="font-bold text-sm text-white">Povinné ručení</span>
                        </div>
                        {isEditing ? (
                          <input
                            type="number"
                            value={offer.liability.price}
                            onChange={(e) => handleOfferChange(offer.id, "liability", "price", e.target.value)}
                            className="w-24 text-right p-1 border border-zinc-600 bg-zinc-700 rounded text-sm font-bold text-white"
                            placeholder="0"
                          />
                        ) : (
                          <span className="font-bold text-white">{formatCurrency(offer.liability.price)}</span>
                        )}
                      </div>
                      {offer.liability.active && (
                        <div className="flex items-center gap-2 pl-6">
                          {isEditing ? (
                            <div className="flex items-center w-full bg-zinc-700 border border-zinc-600 rounded px-2">
                              <input
                                type="number"
                                value={offer.liability.limit}
                                onChange={(e) => handleOfferChange(offer.id, "liability", "limit", e.target.value)}
                                className="w-full p-1 text-sm outline-none bg-transparent text-white"
                                placeholder="35"
                              />
                              <span className="text-xs text-gray-400 whitespace-nowrap">mil. Kč</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-300">
                              Limit: <strong>{offer.liability.limit} mil. Kč</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ALLRISK */}
                    <div
                      className={`p-4 rounded-xl border transition-colors ${
                        offer.allrisk.active ? "bg-blue-900/20 border-blue-700" : "bg-zinc-900/50 border-zinc-700 opacity-60"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          {isEditing && (
                            <input
                              type="checkbox"
                              checked={offer.allrisk.active}
                              onChange={() => handleOfferChange(offer.id, "allrisk", "active", !offer.allrisk.active)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                          )}
                          <span className="font-bold text-sm text-white">Havarijní (Allrisk)</span>
                        </div>
                        {isEditing ? (
                          <input
                            type="number"
                            value={offer.allrisk.price}
                            onChange={(e) => handleOfferChange(offer.id, "allrisk", "price", e.target.value)}
                            className="w-24 text-right p-1 border border-zinc-600 bg-zinc-700 rounded text-sm font-bold text-white"
                            placeholder="0"
                          />
                        ) : (
                          <span className="font-bold text-white">{formatCurrency(offer.allrisk.price)}</span>
                        )}
                      </div>

                      {offer.allrisk.active && (
                        <div className="pl-6 space-y-3">
                          {/* Limit */}
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-400">Pojistná částka</label>
                            {isEditing ? (
                              <div className="flex items-center w-full bg-zinc-700 border border-zinc-600 rounded px-2">
                                <input
                                  type="number"
                                  value={offer.allrisk.limit}
                                  onChange={(e) => handleOfferChange(offer.id, "allrisk", "limit", e.target.value)}
                                  className="w-full p-1 text-sm outline-none bg-transparent text-white"
                                  placeholder="0"
                                />
                                <span className="text-xs text-gray-400">Kč</span>
                              </div>
                            ) : (
                              <div className="text-sm font-semibold text-gray-300">{formatCurrency(offer.allrisk.limit)}</div>
                            )}
                          </div>

                          {/* Deductible */}
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-400">Spoluúčast</label>
                            {isEditing ? (
                              <div className="flex gap-2">
                                <select
                                  value={offer.allrisk.pct}
                                  onChange={(e) => handleOfferChange(offer.id, "allrisk", "pct", e.target.value)}
                                  className="w-1/2 p-1 text-sm border border-zinc-600 bg-zinc-700 rounded text-white"
                                >
                                  <option value="0">0%</option>
                                  <option value="5">5%</option>
                                  <option value="10">10%</option>
                                  <option value="20">20%</option>
                                </select>
                                <select
                                  value={offer.allrisk.min}
                                  onChange={(e) => handleOfferChange(offer.id, "allrisk", "min", e.target.value)}
                                  className="w-1/2 p-1 text-sm border border-zinc-600 bg-zinc-700 rounded text-white"
                                >
                                  <option value="1000">1 000 Kč</option>
                                  <option value="5000">5 000 Kč</option>
                                  <option value="10000">10 000 Kč</option>
                                  <option value="20000">20 000 Kč</option>
                                </select>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-300">
                                {offer.allrisk.pct}%, min. {new Intl.NumberFormat("cs-CZ").format(offer.allrisk.min)} Kč
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* MODULES */}
                    <div>
                      <div className="text-xs font-bold uppercase text-gray-400 mb-2">Připojištění</div>
                      <div className="space-y-2">
                        {moduleTypes.map((t) => {
                          const m = offer.modules[t.id] || { active: false, price: 0, limit: "" };
                          if (!isEditing && !m.active) return null;
                          return (
                            <div
                              key={t.id}
                              className={`flex items-center justify-between p-2 rounded border ${
                                m.active ? "bg-zinc-700 border-zinc-600" : "bg-transparent border-transparent opacity-50"
                              }`}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                {isEditing && (
                                  <input
                                    type="checkbox"
                                    checked={m.active}
                                    onChange={() => handleModuleChange(offer.id, t.id, "active")}
                                    className="w-4 h-4 text-blue-600 rounded flex-shrink-0"
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-300 truncate">{t.name}</div>
                                  {m.active &&
                                    (isEditing ? (
                                      <input
                                        type="text"
                                        value={m.limit}
                                        onChange={(e) => handleModuleChange(offer.id, t.id, "limit", e.target.value)}
                                        className="text-xs border-b border-zinc-600 bg-transparent w-full outline-none text-gray-400"
                                        placeholder="Popis/Limit"
                                      />
                                    ) : (
                                      <div className="text-xs text-gray-500 truncate">{m.limit}</div>
                                    ))}
                                </div>
                              </div>
                              {m.active &&
                                (isEditing ? (
                                  <input
                                    type="number"
                                    value={m.price}
                                    onChange={(e) => handleModuleChange(offer.id, t.id, "price", e.target.value)}
                                    className="w-16 text-right p-1 border border-zinc-600 bg-zinc-700 rounded text-xs font-bold text-white"
                                    placeholder="0"
                                  />
                                ) : (
                                  <div className="text-sm font-bold whitespace-nowrap pl-2 text-white">{formatCurrency(m.price)}</div>
                                ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto p-4 border-t border-zinc-700 bg-zinc-900/50 rounded-b-xl text-center">
                    <button
                      onClick={() => !isEditing && setOffers((prev) => prev.map((o) => ({ ...o, selected: o.id === offer.id })))}
                      className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                        offer.selected ? "bg-[#009ee3] text-white shadow-lg" : "bg-zinc-700 border border-zinc-600 text-gray-400 hover:bg-zinc-600"
                      }`}
                    >
                      {offer.selected ? "DOPORUČENÁ VARIANTA" : "Vybrat tuto variantu"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PREVIEW TAB */}
        {activeTab === "preview" && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-zinc-800 rounded-2xl shadow-xl overflow-hidden border border-zinc-700 mb-8">
              <div className="p-8 text-center border-b border-zinc-700 bg-zinc-900/50">
                <h2 className="text-2xl font-bold text-white">Náhled před odesláním</h2>
                <p className="text-gray-400 mb-6">Zkontrolujte údaje a vyberte způsob exportu.</p>
                <div className="flex flex-wrap justify-center gap-4">
                  <button
                    onClick={copyEmailText}
                    className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 hover:scale-105 transition-all flex items-center gap-2"
                  >
                    {icons.copy} Kopírovat text
                  </button>
                  <button
                    onClick={sendEmail}
                    className="bg-[#009ee3] text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-500 hover:scale-105 transition-all flex items-center gap-2"
                  >
                    {icons.mail} Odeslat e-mailem
                  </button>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-zinc-800 p-4 rounded-2xl shadow-inner border border-zinc-700">
              <div className="text-center text-xs text-gray-400 mb-4 font-medium">NÁHLED NABÍDKY</div>
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-700">
                {/* Client Info */}
                <div className="mb-6 p-4 bg-zinc-800 rounded-lg border-l-4 border-[#009ee3]">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-gray-400">Klient:</div>
                    <div className="font-bold text-white">{clientData.name || "-"}</div>
                    <div className="text-gray-400">Vozidlo:</div>
                    <div className="font-bold text-white">{clientData.car || "-"}</div>
                    <div className="text-gray-400">Pojistná částka:</div>
                    <div className="font-bold text-[#009ee3]">{formatCurrency(clientData.carValue)}</div>
                    <div className="text-gray-400">Adresa:</div>
                    <div className="font-bold text-white">{clientData.address || "-"}</div>
                  </div>
                </div>

                {/* Offers Grid */}
                <div className={`grid gap-4 ${offers.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {offers.slice(0, 4).map((offer) => (
                    <div
                      key={offer.id}
                      className={`rounded-xl overflow-hidden border ${
                        offer.selected ? "border-[#009ee3] ring-2 ring-[#009ee3]/30" : "border-zinc-700"
                      }`}
                    >
                      {offer.selected && (
                        <div className="bg-[#009ee3] text-white text-center text-xs font-bold py-1 uppercase">★ Doporučená</div>
                      )}
                      <div className="p-4 bg-zinc-800 text-center border-b border-zinc-700">
                        <div className="text-sm font-bold text-white">{offer.insurer}</div>
                        <div className="text-xs text-gray-400">{offer.title}</div>
                        <div className="text-xl font-bold text-[#009ee3] mt-2">{formatCurrency(calculateTotal(offer))}</div>
                        <div className="text-xs text-gray-500 uppercase">Ročně</div>
                      </div>
                      <div className="p-3 bg-zinc-900 text-xs space-y-1">
                        {offer.liability.active && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">POV ({offer.liability.limit} mil.)</span>
                            <span className="font-bold text-white">{formatCurrency(offer.liability.price)}</span>
                          </div>
                        )}
                        {offer.allrisk.active && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Havarijní</span>
                            <span className="font-bold text-white">{formatCurrency(offer.allrisk.price)}</span>
                          </div>
                        )}
                        {moduleTypes.map((t) => {
                          const m = offer.modules[t.id];
                          if (!m?.active) return null;
                          return (
                            <div key={t.id} className="flex justify-between">
                              <span className="text-gray-400">{t.name}</span>
                              <span className="font-bold text-white">{formatCurrency(m.price)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Broker Info */}
                <div className="mt-6 pt-4 border-t border-zinc-700 flex justify-between text-sm">
                  <div>
                    <div className="font-bold text-white">{clientData.brokerName}</div>
                    <div className="text-gray-400">Pojišťovací specialista</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white">{clientData.brokerPhone}</div>
                    <div className="text-[#009ee3]">{clientData.brokerEmail}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

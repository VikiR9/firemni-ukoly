"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { loadSession, type User } from "@/lib/auth";
import { LimmitLogo } from "@/lib/logo";
import { 
  INSURERS, 
  CORE_INSURANCE_TYPES, 
  DEFAULT_MODULES,
  getInsurerName,
  getRowTypeName,
  type InsurerId,
} from "@/lib/insurance-config";

// --- TYPES ---
type Phase = "setup" | "entry" | "select" | "export";

type ClientInfo = {
  name: string;
  car: string;
  carValue: string;
  yearOfManufacture: string;
};

type CellData = {
  price: number | null;
  note?: string;
};

type ResearchData = {
  id: string;
  name: string;
  clientInfo: ClientInfo;
  selectedInsurers: string[];
  selectedRows: string[];
  cells: Record<string, Record<string, CellData>>; // [rowId][insurerId] = CellData
  selectedForExport: string[]; // insurer IDs selected for export
  created_at: string;
  updated_at: string;
};

type Notification = {
  msg: string;
  type: "success" | "error" | "info";
};

// --- ICONS ---
const icons = {
  settings: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  ),
  table: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
  ),
  checkSquare: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
  ),
  send: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
  ),
  refresh: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
  ),
  check: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  checkCircle: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  ),
  arrowRight: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
  ),
  arrowLeft: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
  ),
  user: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  ),
  save: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
  ),
};

// All available row types
const ALL_ROW_TYPES = [
  ...CORE_INSURANCE_TYPES.map(t => ({ id: t.id, name: t.name, category: t.category })),
  ...DEFAULT_MODULES.map(m => ({ id: m.id, name: m.name, category: "module" })),
];

export default function PruzkumPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Phase state
  const [phase, setPhase] = useState<Phase>("setup");
  
  // Client info
  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    name: "",
    car: "",
    carValue: "",
    yearOfManufacture: "",
  });
  
  // Configuration state
  const [selectedInsurers, setSelectedInsurers] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>(["pov", "allrisk_5", "m_glass"]);
  
  // Data state
  const [cells, setCells] = useState<Record<string, Record<string, CellData>>>({});
  
  // Selection state
  const [selectedForExport, setSelectedForExport] = useState<string[]>([]);
  
  // UI state
  const [notification, setNotification] = useState<Notification | null>(null);

  // Auth check
  useEffect(() => {
    const user = loadSession();
    if (!user) {
      router.push("/login");
    } else {
      setCurrentUser(user);
    }
  }, [router]);

  // Load saved data
  useEffect(() => {
    const saved = localStorage.getItem("limmit_research_v1");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.clientInfo) setClientInfo(data.clientInfo);
        if (data.selectedInsurers) setSelectedInsurers(data.selectedInsurers);
        if (data.selectedRows) setSelectedRows(data.selectedRows);
        if (data.cells) setCells(data.cells);
        if (data.selectedForExport) setSelectedForExport(data.selectedForExport);
        if (data.phase) setPhase(data.phase);
      } catch (e) {
        console.error("Load error", e);
      }
    }
  }, []);

  // Auto-save
  useEffect(() => {
    const data = { clientInfo, selectedInsurers, selectedRows, cells, selectedForExport, phase };
    localStorage.setItem("limmit_research_v1", JSON.stringify(data));
  }, [clientInfo, selectedInsurers, selectedRows, cells, selectedForExport, phase]);

  // Helpers
  const showNotification = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const formatCurrency = (value: number | null | undefined): string => {
    if (value === undefined || value === null) return "-";
    return new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: "CZK",
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Toggle insurer selection
  const toggleInsurer = (id: string) => {
    setSelectedInsurers(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Toggle row selection
  const toggleRow = (id: string) => {
    setSelectedRows(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  // Update cell data
  const updateCell = (rowId: string, insurerId: string, price: number | null) => {
    setCells(prev => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        [insurerId]: { price, note: prev[rowId]?.[insurerId]?.note },
      },
    }));
  };

  // Calculate column total
  const calculateColumnTotal = (insurerId: string): number => {
    let total = 0;
    selectedRows.forEach(rowId => {
      const price = cells[rowId]?.[insurerId]?.price;
      if (price) total += price;
    });
    return total;
  };

  // Toggle export selection
  const toggleExportSelection = (insurerId: string) => {
    setSelectedForExport(prev =>
      prev.includes(insurerId) ? prev.filter(i => i !== insurerId) : [...prev, insurerId]
    );
  };

  // New research
  const handleNewResearch = () => {
    if (Object.keys(cells).length > 0 && !confirm("Opravdu chcete začít nový průzkum? Všechna data budou vymazána.")) {
      return;
    }
    setClientInfo({ name: "", car: "", carValue: "", yearOfManufacture: "" });
    setSelectedInsurers([]);
    setSelectedRows(["pov", "allrisk_5", "m_glass"]);
    setCells({});
    setSelectedForExport([]);
    setPhase("setup");
    showNotification("Nový průzkum připraven.");
  };

  // Export to Kalkulace
  const exportToKalkulace = () => {
    if (selectedForExport.length === 0) {
      showNotification("Vyberte alespoň jednu pojišťovnu pro export.", "error");
      return;
    }

    // Build offers for Kalkulace
    const offers = selectedForExport.map((insurerId, index) => {
      const insurer = INSURERS.find(i => i.id === insurerId);
      
      // Get POV data
      const povPrice = cells["pov"]?.[insurerId]?.price || 0;
      
      // Get Allrisk data (prefer 5%, fallback to 10%)
      const allrisk5Price = cells["allrisk_5"]?.[insurerId]?.price;
      const allrisk10Price = cells["allrisk_10"]?.[insurerId]?.price;
      const allriskPrice = allrisk5Price || allrisk10Price || 0;
      const allriskPct = allrisk5Price ? 5 : (allrisk10Price ? 10 : 5);
      
      // Build modules
      const modules: Record<string, { active: boolean; price: number; limit: string }> = {};
      DEFAULT_MODULES.forEach(mod => {
        const price = cells[mod.id]?.[insurerId]?.price;
        if (price) {
          modules[mod.id] = { active: true, price, limit: "" };
        }
      });

      return {
        id: Date.now() + index,
        insurer: insurer?.name || insurerId,
        title: `Varianta ${String.fromCharCode(65 + index)}`,
        liability: { active: povPrice > 0, limit: "35", price: povPrice },
        allrisk: { 
          active: allriskPrice > 0, 
          limit: parseInt(clientInfo.carValue) || 0, 
          pct: allriskPct, 
          min: 5000, 
          price: allriskPrice 
        },
        modules,
        selected: index === 0,
      };
    });

    // Build module types (only those that have data)
    const moduleTypes = DEFAULT_MODULES
      .filter(mod => selectedRows.includes(mod.id))
      .map(mod => ({ id: mod.id, name: mod.name }));

    // Build client data
    const clientData = {
      name: clientInfo.name,
      address: "",
      car: clientInfo.car,
      carValue: clientInfo.carValue,
      brokerName: "Bc. Miloš Weber",
      brokerPhone: "777 557 253",
      brokerEmail: "milos.weber@limmit.cz",
    };

    // Save to localStorage for Kalkulace to pick up
    const kalkulaceData = {
      clientData,
      moduleTypes,
      offers,
      timestamp: Date.now(),
      fromResearch: true,
    };
    localStorage.setItem("limmit_data_v4", JSON.stringify(kalkulaceData));
    
    showNotification(`Export ${selectedForExport.length} variant do Kalkulace dokončen.`, "success");
    
    // Navigate to Kalkulace
    setTimeout(() => {
      router.push("/kalkulace");
    }, 1000);
  };

  // Phase navigation
  const phases: { id: Phase; label: string; icon: JSX.Element }[] = [
    { id: "setup", label: "Konfigurace", icon: icons.settings },
    { id: "entry", label: "Zadávání", icon: icons.table },
    { id: "select", label: "Výběr", icon: icons.checkSquare },
    { id: "export", label: "Export", icon: icons.send },
  ];

  const currentPhaseIndex = phases.findIndex(p => p.id === phase);
  const canProceed = phase === "setup" 
    ? selectedInsurers.length > 0 && selectedRows.length > 0
    : phase === "entry"
    ? Object.keys(cells).length > 0
    : phase === "select"
    ? selectedForExport.length > 0
    : true;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="text-white text-lg">Načítání...</div>
      </div>
    );
  }

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
        <div className="max-w-[1800px] mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <LimmitLogo height={28} />
            <div className="h-6 w-px bg-blue-800"></div>
            <h1 className="text-lg font-bold tracking-wide">Průzkum trhu</h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleNewResearch}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-100 hover:bg-red-500/20 hover:text-white transition-all text-sm font-medium"
            >
              {icons.refresh} Nový průzkum
            </button>
          </div>
        </div>
      </header>

      {/* PHASE INDICATOR */}
      <div className="bg-zinc-800 border-b border-zinc-700">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {phases.map((p, idx) => (
              <div key={p.id} className="flex items-center flex-1">
                <button
                  onClick={() => idx <= currentPhaseIndex && setPhase(p.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                    phase === p.id
                      ? "bg-[#009ee3] text-white shadow-md"
                      : idx < currentPhaseIndex
                      ? "bg-emerald-600/20 text-emerald-400 cursor-pointer hover:bg-emerald-600/30"
                      : "bg-zinc-700/50 text-gray-500 cursor-not-allowed"
                  }`}
                  disabled={idx > currentPhaseIndex}
                >
                  {p.icon}
                  <span className="font-medium">{p.label}</span>
                </button>
                {idx < phases.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-4 ${idx < currentPhaseIndex ? "bg-emerald-600" : "bg-zinc-700"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-[1800px] mx-auto p-6">
        {/* CLIENT INFO - Always visible */}
        <div className="bg-zinc-800 rounded-2xl shadow-sm border border-zinc-700 p-6 mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            {icons.user} Údaje o klientovi
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Klient</label>
              <input
                value={clientInfo.name}
                onChange={(e) => setClientInfo({ ...clientInfo, name: e.target.value })}
                className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded focus:ring-2 focus:ring-blue-500 outline-none text-white"
                placeholder="Jméno klienta"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Vozidlo</label>
              <input
                value={clientInfo.car}
                onChange={(e) => setClientInfo({ ...clientInfo, car: e.target.value })}
                className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded focus:ring-2 focus:ring-blue-500 outline-none text-white"
                placeholder="Značka a model"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Pojistná částka</label>
              <input
                type="number"
                value={clientInfo.carValue}
                onChange={(e) => setClientInfo({ ...clientInfo, carValue: e.target.value })}
                className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded focus:ring-2 focus:ring-blue-500 outline-none text-white"
                placeholder="Kč"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Rok výroby</label>
              <input
                type="number"
                value={clientInfo.yearOfManufacture}
                onChange={(e) => setClientInfo({ ...clientInfo, yearOfManufacture: e.target.value })}
                className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded focus:ring-2 focus:ring-blue-500 outline-none text-white"
                placeholder="2024"
              />
            </div>
          </div>
        </div>

        {/* PHASE: SETUP */}
        {phase === "setup" && (
          <div className="space-y-6">
            {/* Insurers Selection */}
            <div className="bg-zinc-800 rounded-2xl shadow-sm border border-zinc-700 p-6">
              <h2 className="text-lg font-bold text-white mb-4">Výběr pojišťoven (sloupce)</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {INSURERS.map((insurer) => (
                  <button
                    key={insurer.id}
                    onClick={() => toggleInsurer(insurer.id)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      selectedInsurers.includes(insurer.id)
                        ? "border-[#009ee3] bg-[#009ee3]/10 text-white"
                        : "border-zinc-600 bg-zinc-700/50 text-gray-400 hover:border-zinc-500"
                    }`}
                  >
                    <div className="font-bold text-sm">{insurer.shortName}</div>
                    <div className="text-xs opacity-70 truncate">{insurer.name}</div>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setSelectedInsurers(INSURERS.map(i => i.id))}
                  className="text-sm text-[#009ee3] hover:underline"
                >
                  Vybrat vše
                </button>
                <span className="text-gray-500">|</span>
                <button
                  onClick={() => setSelectedInsurers([])}
                  className="text-sm text-gray-400 hover:underline"
                >
                  Zrušit výběr
                </button>
              </div>
            </div>

            {/* Row Types Selection */}
            <div className="bg-zinc-800 rounded-2xl shadow-sm border border-zinc-700 p-6">
              <h2 className="text-lg font-bold text-white mb-4">Výběr typů pojištění (řádky)</h2>
              
              {/* Core types */}
              <div className="mb-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Základní pojištění</h3>
                <div className="flex flex-wrap gap-2">
                  {CORE_INSURANCE_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => toggleRow(type.id)}
                      className={`px-4 py-2 rounded-lg border transition-all ${
                        selectedRows.includes(type.id)
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-zinc-600 bg-zinc-700/50 text-gray-400 hover:border-zinc-500"
                      }`}
                    >
                      {selectedRows.includes(type.id) && <span className="mr-2">✓</span>}
                      {type.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Module types */}
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Připojištění</h3>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_MODULES.map((mod) => (
                    <button
                      key={mod.id}
                      onClick={() => toggleRow(mod.id)}
                      className={`px-4 py-2 rounded-lg border transition-all ${
                        selectedRows.includes(mod.id)
                          ? "border-blue-500 bg-blue-500/10 text-blue-400"
                          : "border-zinc-600 bg-zinc-700/50 text-gray-400 hover:border-zinc-500"
                      }`}
                    >
                      {selectedRows.includes(mod.id) && <span className="mr-2">✓</span>}
                      {mod.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
              <div className="text-sm text-gray-400">
                Vybrané pojišťovny: <span className="text-white font-bold">{selectedInsurers.length}</span> | 
                Vybrané řádky: <span className="text-white font-bold">{selectedRows.length}</span> | 
                Tabulka: <span className="text-white font-bold">{selectedRows.length} × {selectedInsurers.length}</span> buněk
              </div>
            </div>
          </div>
        )}

        {/* PHASE: ENTRY */}
        {phase === "entry" && (
          <div className="bg-zinc-800 rounded-2xl shadow-sm border border-zinc-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-zinc-900">
                    <th className="p-3 text-left text-sm font-bold text-gray-400 border-b border-zinc-700 sticky left-0 bg-zinc-900 z-10 min-w-[150px]">
                      Typ pojištění
                    </th>
                    {selectedInsurers.map((insurerId) => (
                      <th key={insurerId} className="p-3 text-center text-sm font-bold text-white border-b border-zinc-700 min-w-[120px]">
                        {getInsurerName(insurerId, true)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((rowId, rowIdx) => {
                    const rowType = ALL_ROW_TYPES.find(r => r.id === rowId);
                    const isCore = rowType?.category !== "module";
                    return (
                      <tr key={rowId} className={rowIdx % 2 === 0 ? "bg-zinc-800" : "bg-zinc-800/50"}>
                        <td className={`p-3 text-sm font-medium border-b border-zinc-700 sticky left-0 z-10 ${rowIdx % 2 === 0 ? "bg-zinc-800" : "bg-zinc-800/50"} ${isCore ? "text-emerald-400" : "text-blue-400"}`}>
                          {rowType?.name || rowId}
                        </td>
                        {selectedInsurers.map((insurerId) => (
                          <td key={insurerId} className="p-2 border-b border-zinc-700 text-center">
                            <input
                              type="number"
                              value={cells[rowId]?.[insurerId]?.price || ""}
                              onChange={(e) => updateCell(rowId, insurerId, e.target.value ? parseInt(e.target.value) : null)}
                              className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded text-white text-center text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="-"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr className="bg-zinc-900 font-bold">
                    <td className="p-3 text-sm text-white border-t-2 border-zinc-600 sticky left-0 bg-zinc-900 z-10">
                      CELKEM
                    </td>
                    {selectedInsurers.map((insurerId) => {
                      const total = calculateColumnTotal(insurerId);
                      return (
                        <td key={insurerId} className="p-3 text-center text-lg text-[#009ee3] border-t-2 border-zinc-600">
                          {formatCurrency(total || null)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PHASE: SELECT */}
        {phase === "select" && (
          <div className="bg-zinc-800 rounded-2xl shadow-sm border border-zinc-700 overflow-hidden">
            <div className="p-4 border-b border-zinc-700 bg-zinc-900/50">
              <h2 className="text-lg font-bold text-white">Vyberte varianty pro export do nabídky</h2>
              <p className="text-sm text-gray-400">Zaškrtněte pojišťovny, které chcete přenést do modulu Kalkulace</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-zinc-900">
                    <th className="p-3 text-left text-sm font-bold text-gray-400 border-b border-zinc-700 sticky left-0 bg-zinc-900 z-10 min-w-[150px]">
                      Typ pojištění
                    </th>
                    {selectedInsurers.map((insurerId) => (
                      <th key={insurerId} className="p-3 text-center border-b border-zinc-700 min-w-[120px]">
                        <div className="flex flex-col items-center gap-2">
                          <span className={`text-sm font-bold ${selectedForExport.includes(insurerId) ? "text-[#009ee3]" : "text-white"}`}>
                            {getInsurerName(insurerId, true)}
                          </span>
                          <button
                            onClick={() => toggleExportSelection(insurerId)}
                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                              selectedForExport.includes(insurerId)
                                ? "border-[#009ee3] bg-[#009ee3] text-white"
                                : "border-zinc-600 bg-zinc-700 text-gray-400 hover:border-zinc-500"
                            }`}
                          >
                            {selectedForExport.includes(insurerId) && icons.check}
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((rowId, rowIdx) => {
                    const rowType = ALL_ROW_TYPES.find(r => r.id === rowId);
                    const isCore = rowType?.category !== "module";
                    return (
                      <tr key={rowId} className={rowIdx % 2 === 0 ? "bg-zinc-800" : "bg-zinc-800/50"}>
                        <td className={`p-3 text-sm font-medium border-b border-zinc-700 sticky left-0 z-10 ${rowIdx % 2 === 0 ? "bg-zinc-800" : "bg-zinc-800/50"} ${isCore ? "text-emerald-400" : "text-blue-400"}`}>
                          {rowType?.name || rowId}
                        </td>
                        {selectedInsurers.map((insurerId) => {
                          const price = cells[rowId]?.[insurerId]?.price;
                          const isSelected = selectedForExport.includes(insurerId);
                          return (
                            <td key={insurerId} className={`p-3 border-b border-zinc-700 text-center text-sm ${isSelected ? "bg-[#009ee3]/5" : ""}`}>
                              <span className={price ? "text-white font-medium" : "text-gray-500"}>
                                {formatCurrency(price)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr className="bg-zinc-900 font-bold">
                    <td className="p-3 text-sm text-white border-t-2 border-zinc-600 sticky left-0 bg-zinc-900 z-10">
                      CELKEM
                    </td>
                    {selectedInsurers.map((insurerId) => {
                      const total = calculateColumnTotal(insurerId);
                      const isSelected = selectedForExport.includes(insurerId);
                      return (
                        <td key={insurerId} className={`p-3 text-center text-lg border-t-2 border-zinc-600 ${isSelected ? "text-[#009ee3] bg-[#009ee3]/10" : "text-gray-400"}`}>
                          {formatCurrency(total || null)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-zinc-700 bg-zinc-900/50">
              <div className="text-sm text-gray-400">
                Vybrané pro export: <span className="text-[#009ee3] font-bold">{selectedForExport.length}</span> pojišťoven
              </div>
            </div>
          </div>
        )}

        {/* PHASE: EXPORT */}
        {phase === "export" && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-zinc-800 rounded-2xl shadow-sm border border-zinc-700 p-6">
              <h2 className="text-lg font-bold text-white mb-4">Shrnutí exportu</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Client info */}
                <div className="bg-zinc-900/50 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Klient</h3>
                  <div className="text-white font-bold">{clientInfo.name || "-"}</div>
                  <div className="text-gray-400">{clientInfo.car || "-"}</div>
                  <div className="text-[#009ee3] font-bold">{formatCurrency(parseInt(clientInfo.carValue) || null)}</div>
                </div>

                {/* Selected insurers */}
                <div className="bg-zinc-900/50 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Vybrané pojišťovny ({selectedForExport.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedForExport.map((insurerId, idx) => (
                      <div key={insurerId} className="bg-[#009ee3]/20 text-[#009ee3] px-3 py-1 rounded-full text-sm font-medium">
                        Varianta {String.fromCharCode(65 + idx)}: {getInsurerName(insurerId, true)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview of what will be exported */}
              <div className="mt-6">
                <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Náhled variant</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {selectedForExport.map((insurerId, idx) => {
                    const total = calculateColumnTotal(insurerId);
                    return (
                      <div key={insurerId} className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
                        <div className="text-xs text-[#009ee3] font-bold uppercase mb-1">Varianta {String.fromCharCode(65 + idx)}</div>
                        <div className="text-white font-bold mb-2">{getInsurerName(insurerId, true)}</div>
                        <div className="text-2xl font-bold text-[#009ee3] mb-3">{formatCurrency(total)}</div>
                        <div className="space-y-1 text-xs">
                          {selectedRows.map(rowId => {
                            const price = cells[rowId]?.[insurerId]?.price;
                            if (!price) return null;
                            const rowType = ALL_ROW_TYPES.find(r => r.id === rowId);
                            return (
                              <div key={rowId} className="flex justify-between text-gray-400">
                                <span>{rowType?.name}</span>
                                <span className="text-white">{formatCurrency(price)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Export button */}
            <div className="text-center">
              <button
                onClick={exportToKalkulace}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center gap-3 mx-auto"
              >
                {icons.send}
                Přenést do Kalkulace
                {icons.arrowRight}
              </button>
              <p className="text-gray-400 text-sm mt-2">
                Data budou přenesena do modulu Kalkulace pro vytvoření nabídky
              </p>
            </div>
          </div>
        )}

        {/* NAVIGATION BUTTONS */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => currentPhaseIndex > 0 && setPhase(phases[currentPhaseIndex - 1].id)}
            disabled={currentPhaseIndex === 0}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              currentPhaseIndex === 0
                ? "bg-zinc-700/50 text-gray-500 cursor-not-allowed"
                : "bg-zinc-700 text-white hover:bg-zinc-600"
            }`}
          >
            {icons.arrowLeft} Zpět
          </button>
          
          {phase !== "export" && (
            <button
              onClick={() => canProceed && setPhase(phases[currentPhaseIndex + 1].id)}
              disabled={!canProceed}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                !canProceed
                  ? "bg-zinc-700/50 text-gray-500 cursor-not-allowed"
                  : "bg-[#009ee3] text-white hover:bg-blue-500"
              }`}
            >
              Pokračovat {icons.arrowRight}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

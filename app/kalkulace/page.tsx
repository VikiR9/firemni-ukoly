"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { loadSession, type User } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { LIMMIT_LOGO_SRC } from "@/lib/logo";
import { DEFAULT_MODULES } from "@/lib/insurance-config";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import ModuleShell from "@/app/components/ModuleShell";

// --- TYPES ---
type SavedCalculation = {
  id: string;
  name: string;
  created_by: string;
  client_data: ClientData;
  module_types: ModuleType[];
  offers: Offer[];
  created_at: string;
  updated_at: string;
};

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
  upload: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
  ),
  download: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  ),
  folder: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Auth check
  useEffect(() => {
    const user = loadSession();
    if (!user) {
      router.push("/login");
    } else {
      setCurrentUser(user);
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

  const [moduleTypes, setModuleTypes] = useState<ModuleType[]>(
    DEFAULT_MODULES.map(m => ({ id: m.id, name: m.name }))
  );

  const [offers, setOffers] = useState<Offer[]>([]);
  const [isEditing, setIsEditing] = useState(true);
  const [activeTab, setActiveTab] = useState<"offer" | "preview">("offer");
  const [notification, setNotification] = useState<Notification | null>(null);
  const [newModuleTypeName, setNewModuleTypeName] = useState("");
  
  // Cloud save/load state
  const [savedCalculations, setSavedCalculations] = useState<SavedCalculation[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [currentCalculationId, setCurrentCalculationId] = useState<string | null>(null);

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

  // --- CLOUD SAVE/LOAD ---
  const fetchCalculations = useCallback(async () => {
    if (!currentUser) return;
    try {
      const { data, error } = await supabase
        .from("calculations")
        .select("*")
        .eq("created_by", currentUser.username)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setSavedCalculations(data || []);
    } catch (err) {
      console.error("Error fetching calculations:", err);
      showNotification("Nepodařilo se načíst uložené kalkulace.", "error");
    }
  }, [currentUser, showNotification]);

  const saveToCloud = async () => {
    if (!currentUser) {
      showNotification("Musíte být přihlášeni.", "error");
      return;
    }

    if (!saveName.trim()) {
      showNotification("Zadejte název kalkulace.", "error");
      return;
    }

    try {
      const calculationData = {
        name: saveName.trim(),
        created_by: currentUser.username,
        client_data: clientData,
        module_types: moduleTypes,
        offers: offers,
      };

      if (currentCalculationId) {
        // Update existing
        const { error } = await supabase
          .from("calculations")
          .update(calculationData)
          .eq("id", currentCalculationId);

        if (error) throw error;
        showNotification("Kalkulace byla aktualizována.", "success");
      } else {
        // Create new
        const { data, error } = await supabase
          .from("calculations")
          .insert(calculationData)
          .select()
          .single();

        if (error) throw error;
        setCurrentCalculationId(data.id);
        showNotification("Kalkulace byla uložena.", "success");
      }

      setShowSaveModal(false);
      setSaveName("");
      fetchCalculations();
    } catch (err) {
      console.error("Error saving calculation:", err);
      showNotification("Nepodařilo se uložit kalkulaci.", "error");
    }
  };

  const loadCalculation = async (calculation: SavedCalculation) => {
    try {
      setClientData(calculation.client_data);
      setModuleTypes(calculation.module_types);
      setOffers(calculation.offers);
      setCurrentCalculationId(calculation.id);
      setSaveName(calculation.name);
      setShowLoadModal(false);
      setIsEditing(false);
      showNotification(`Kalkulace "${calculation.name}" byla načtena.`, "success");
    } catch (err) {
      console.error("Error loading calculation:", err);
      showNotification("Nepodařilo se načíst kalkulaci.", "error");
    }
  };

  const deleteCalculation = async (id: string) => {
    if (!confirm("Opravdu chcete smazat tuto kalkulaci?")) return;

    try {
      const { error } = await supabase
        .from("calculations")
        .delete()
        .eq("id", id);

      if (error) throw error;

      if (currentCalculationId === id) {
        setCurrentCalculationId(null);
        setSaveName("");
      }

      showNotification("Kalkulace byla smazána.", "success");
      fetchCalculations();
    } catch (err) {
      console.error("Error deleting calculation:", err);
      showNotification("Nepodařilo se smazat kalkulaci.", "error");
    }
  };

  // Fetch calculations on mount
  useEffect(() => {
    if (currentUser) {
      fetchCalculations();
    }
  }, [currentUser, fetchCalculations]);

  // --- EXPORT LOGIC ---
  const buildEmailHtml = (selectedOffer: Offer): string => {
    const currentDate = new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });

    // Build offer cards HTML
    const offerCardsHtml = offers
      .map((o) => {
        const total = calculateTotal(o);
        const isSelected = o.id === selectedOffer.id;
        const cardBorder = isSelected ? "2px solid #009ee3" : "1px solid #e2e8f0";
        const cardBg = isSelected ? "#f0f9ff" : "#ffffff";

        const modulesHtml = Object.entries(o.modules || {})
          .filter(([, m]) => m.active)
          .map(([key, m]) => {
            const moduleType = moduleTypes.find((t) => t.id === key);
            const label = moduleType?.name || "Připojištění";
            return `<tr><td style="padding:4px 8px;font-size:12px;color:#64748b;">${label}${m.limit ? ` (${m.limit})` : ""}</td><td style="padding:4px 8px;font-size:12px;color:#334155;text-align:right;">${formatCurrency(m.price)}</td></tr>`;
          })
          .join("");

        return `
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;border:${cardBorder};border-radius:8px;background:${cardBg};overflow:hidden;">
                            ${isSelected ? `<tr><td colspan="2" style="background:#009ee3;color:#ffffff;padding:6px 12px;font-size:11px;font-weight:bold;text-transform:uppercase;text-align:center;">✓ Doporučená varianta</td></tr>` : ""}
                            <tr>
                                <td colspan="2" style="padding:16px;border-bottom:1px solid #e2e8f0;">
                                    <div style="font-size:16px;font-weight:bold;color:#1a1a5c;margin-bottom:4px;">${o.insurer}</div>
                                    <div style="font-size:12px;color:#64748b;">${o.title}</div>
                                </td>
                            </tr>
                            ${
                              o.liability.active
                                ? `
                            <tr>
                                <td style="padding:8px 16px;font-size:13px;color:#334155;font-weight:500;">Povinné ručení (${o.liability.limit} mil. Kč)</td>
                                <td style="padding:8px 16px;font-size:13px;color:#1e293b;font-weight:bold;text-align:right;">${formatCurrency(o.liability.price)}</td>
                            </tr>`
                                : ""
                            }
                            ${
                              o.allrisk.active
                                ? `
                            <tr>
                                <td style="padding:8px 16px;font-size:13px;color:#334155;font-weight:500;">Havarijní (${o.allrisk.pct}% / min. ${formatCurrency(o.allrisk.min)})</td>
                                <td style="padding:8px 16px;font-size:13px;color:#1e293b;font-weight:bold;text-align:right;">${formatCurrency(o.allrisk.price)}</td>
                            </tr>`
                                : ""
                            }
                            ${modulesHtml ? `<tr><td colspan="2" style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">${modulesHtml}</table></td></tr>` : ""}
                            <tr>
                                <td colspan="2" style="padding:16px;background:${isSelected ? "#009ee3" : "#1a1a5c"};text-align:center;">
                                    <div style="font-size:24px;font-weight:bold;color:#ffffff;">${formatCurrency(total)}</div>
                                    <div style="font-size:11px;color:rgba(255,255,255,0.8);text-transform:uppercase;">ročně</div>
                                </td>
                            </tr>
                        </table>
                    `;
      })
      .join("");

    return `
<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nabídka pojištění - ${clientData.name || "Klient"}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <!-- Email Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:20px 0;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#1a1a5c 0%,#2d2d7a 100%);padding:32px 24px;text-align:center;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="text-align:left;vertical-align:middle;">
                                        <table cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding-right:12px;">
                                                    <img src="${window.location.origin}${LIMMIT_LOGO_SRC}" width="44" height="44" alt="LIMMIT" style="display:block;border-radius:5px;" />
                                                </td>
                                                <td>
                                                    <div style="font-size:28px;font-weight:bold;color:#ffffff;line-height:1.2;">NABÍDKA</div>
                                                    <div style="font-size:28px;font-weight:bold;color:#009ee3;line-height:1.2;">POJIŠTĚNÍ</div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td style="text-align:right;">
                                        <div style="font-size:12px;color:rgba(255,255,255,0.7);">LIMMIT s.r.o.</div>
                                        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">${currentDate}</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Greeting -->
                    <tr>
                        <td style="padding:24px 24px 16px 24px;">
                            <p style="margin:0 0 12px 0;font-size:15px;color:#334155;line-height:1.6;">Dobrý den,</p>
                            <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">zasílám Vám nabídku pojištění pro vozidlo <strong style="color:#1a1a5c;">${clientData.car || "–"}</strong>. V příloze naleznete PDF dokument s kompletním přehledem na jednu stranu A4.</p>
                        </td>
                    </tr>

                    <!-- Client Info Box -->
                    <tr>
                        <td style="padding:0 24px 24px 24px;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-left:4px solid #009ee3;border-radius:0 8px 8px 0;">
                                <tr>
                                    <td style="padding:16px;">
                                        <div style="font-size:11px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Údaje klienta</div>
                                        <div style="font-size:15px;font-weight:bold;color:#1a1a5c;margin-bottom:4px;">${clientData.name || "–"}</div>
                                        <div style="font-size:13px;color:#64748b;">${clientData.address || ""}</div>
                                        ${clientData.carValue ? `<div style="font-size:13px;color:#009ee3;font-weight:bold;margin-top:8px;">Pojistná částka: ${formatCurrency(clientData.carValue)}</div>` : ""}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Offer Cards -->
                    <tr>
                        <td style="padding:0 24px;">
                            <div style="font-size:11px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:12px;">Přehled variant</div>
                            ${offerCardsHtml}
                        </td>
                    </tr>

                    <!-- CTA Section -->
                    <tr>
                        <td style="padding:24px;text-align:center;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:8px;border:1px dashed #009ee3;">
                                <tr>
                                    <td style="padding:20px;">
                                        <div style="font-size:14px;color:#1a1a5c;font-weight:bold;margin-bottom:8px;">📎 V příloze naleznete PDF dokument</div>
                                        <div style="font-size:13px;color:#64748b;">Obsahuje podrobný rozpis všech variant na jedné stránce A4.</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Divider -->
                    <tr>
                        <td style="padding:0 24px;">
                            <div style="height:1px;background:#e2e8f0;"></div>
                        </td>
                    </tr>

                    <!-- Footer / Contact -->
                    <tr>
                        <td style="padding:24px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="vertical-align:top;">
                                        <div style="font-size:11px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Váš poradce</div>
                                        <div style="font-size:15px;font-weight:bold;color:#1a1a5c;">${clientData.brokerName}</div>
                                        <div style="font-size:13px;color:#64748b;margin-top:4px;">Pojišťovací specialista</div>
                                    </td>
                                    <td style="vertical-align:top;text-align:right;">
                                        <div style="font-size:13px;color:#1a1a5c;margin-bottom:4px;">📞 ${clientData.brokerPhone}</div>
                                        <div style="font-size:13px;color:#009ee3;">✉️ ${clientData.brokerEmail}</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Bottom Bar -->
                    <tr>
                        <td style="background:#1a1a5c;padding:16px 24px;text-align:center;">
                            <div style="font-size:11px;color:rgba(255,255,255,0.6);">© ${new Date().getFullYear()} LIMMIT s.r.o. | Všechna práva vyhrazena</div>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
                `;
  };

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
LIMMIT s.r.o.`;
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

  const copyEmailHtml = async () => {
    const selectedOffer = offers.find((o) => o.selected) || offers[0];
    if (!selectedOffer) {
      showNotification("Chybí data nabídek.", "error");
      return;
    }

    try {
      const html = buildEmailHtml(selectedOffer);
      const blob = new Blob([html], { type: "text/html" });
      const clipboardItem = new ClipboardItem({ "text/html": blob, "text/plain": new Blob([html], { type: "text/plain" }) });
      await navigator.clipboard.write([clipboardItem]);
      showNotification("HTML email zkopírován do schránky.", "success");
    } catch {
      // Fallback - copy as plain text
      try {
        const selectedOffer = offers.find((o) => o.selected) || offers[0];
        await navigator.clipboard.writeText(buildEmailHtml(selectedOffer));
        showNotification("HTML kód zkopírován jako text.", "success");
      } catch {
        showNotification("Kopírování se nezdařilo.", "error");
      }
    }
  };

  // --- PDF GENERATION ---
  const generatePdfAttachment = async (): Promise<{ blob: Blob; fileName: string; pdf: jsPDF }> => {
    // A4 dimensions in pixels at 96 DPI
    const A4_WIDTH_PX = 794;
    const A4_HEIGHT_PX = 1123;

    // Build PDF HTML content
    const offersHtml = offers.slice(0, 4).map((offer) => {
      const modulesHtml = moduleTypes
        .map((t) => {
          const m = offer.modules[t.id];
          if (!m || !m.active) return "";
          return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:9px;border-bottom:1px dotted #e2e8f0;">
            <span style="color:#475569;font-weight:500;">${t.name}${m.limit ? ` <span style="color:#94a3b8;font-weight:400;">(${m.limit})</span>` : ""}</span>
            <span style="font-weight:600;color:#1e293b;">${formatCurrency(m.price)}</span>
          </div>`;
        })
        .join("");

      return `
        <div style="border:${offer.selected ? "2px solid #009ee3" : "1px solid #e2e8f0"};border-radius:8px;overflow:hidden;background:white;${offer.selected ? "box-shadow:0 0 0 2px rgba(0,158,227,0.2);" : ""}">
          ${offer.selected ? '<div style="background:#009ee3;color:white;text-align:center;font-size:8px;font-weight:bold;text-transform:uppercase;padding:4px;letter-spacing:0.5px;">★ DOPORUČENÁ VOLBA</div>' : ""}
          <div style="background:#f8fafc;padding:12px 10px;text-align:center;border-bottom:1px solid #e2e8f0;">
            <div style="font-size:12px;font-weight:bold;color:#1a1a5c;margin-bottom:2px;line-height:1.2;">${offer.insurer}</div>
            <div style="font-size:9px;color:#64748b;margin-bottom:6px;">${offer.title}</div>
            <div style="font-size:22px;font-weight:bold;color:#009ee3;">${formatCurrency(calculateTotal(offer))}</div>
            <div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:bold;letter-spacing:0.5px;">Ročně</div>
          </div>
          <div style="padding:12px;">
            ${offer.liability.active ? `
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-weight:700;color:#166534;font-size:11px;">🛡️ POVINNÉ RUČENÍ</span>
                  <span style="font-weight:800;color:#166534;font-size:13px;">${formatCurrency(offer.liability.price)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;background:white;border-radius:4px;padding:6px 8px;">
                  <span style="font-size:9px;color:#64748b;">Limit plnění:</span>
                  <span style="font-size:10px;font-weight:700;color:#0f172a;">${offer.liability.limit} mil. Kč</span>
                </div>
              </div>` : ""}
            ${offer.allrisk.active ? `
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-weight:700;color:#1e40af;font-size:11px;">🚗 HAVARIJNÍ</span>
                  <span style="font-weight:800;color:#1e40af;font-size:13px;">${formatCurrency(offer.allrisk.price)}</span>
                </div>
                <div style="background:white;border-radius:4px;padding:6px 8px;">
                  <div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px dashed #e2e8f0;">
                    <span style="font-size:9px;color:#64748b;">Pojistná částka:</span>
                    <span style="font-size:10px;font-weight:700;color:#0f172a;">${formatCurrency(offer.allrisk.limit)}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;padding:2px 0;">
                    <span style="font-size:9px;color:#64748b;">Spoluúčast:</span>
                    <span style="font-size:10px;font-weight:700;color:#0f172a;">${offer.allrisk.pct}% / min. ${new Intl.NumberFormat("cs-CZ").format(offer.allrisk.min)} Kč</span>
                  </div>
                </div>
              </div>` : ""}
            ${modulesHtml ? `
              <div style="margin-top:6px;">
                <div style="font-size:8px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;letter-spacing:0.5px;">Připojištění</div>
                ${modulesHtml}
              </div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    const pdfHtml = `
      <div style="width:${A4_WIDTH_PX}px;height:${A4_HEIGHT_PX}px;max-height:${A4_HEIGHT_PX}px;overflow:hidden;position:relative;background:white;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;">
        <div style="background:#1a1a5c;color:white;padding:20px 40px;display:flex;justify-content:space-between;align-items:center;height:70px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <img src="${LIMMIT_LOGO_SRC}" width="40" height="40" alt="LIMMIT" style="display:block;border-radius:5px;" />
            <span style="font-size:24px;font-weight:bold;">LIMMIT s.r.o.</span>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;">${new Date().toLocaleDateString("cs-CZ")}</div>
          </div>
        </div>

        <div style="padding:25px 40px 20px 40px;">
          <div style="background:#f8fafc;border-left:5px solid #009ee3;padding:12px 15px;margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #e2e8f0;font-size:11px;">
              <span style="font-weight:600;color:#334155;">Klient</span>
              <span style="font-weight:700;color:#0f172a;">${clientData.name || "–"}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #e2e8f0;font-size:11px;">
              <span style="font-weight:600;color:#334155;">Vozidlo</span>
              <span style="font-weight:700;color:#0f172a;">${clientData.car || "–"}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #e2e8f0;font-size:11px;">
              <span style="font-weight:600;color:#334155;">Pojistná částka</span>
              <span style="font-weight:700;color:#009ee3;">${formatCurrency(clientData.carValue)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;">
              <span style="font-weight:600;color:#334155;">Adresa</span>
              <span style="font-weight:700;color:#0f172a;">${clientData.address || "–"}</span>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(${offers.length <= 2 ? 2 : Math.min(offers.length, 4)}, 1fr);gap:12px;">
            ${offersHtml}
          </div>
        </div>

        <div style="position:absolute;bottom:0;left:0;right:0;padding:15px 40px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#64748b;background:white;">
          <div>
            <strong style="color:#1a1a5c;">${clientData.brokerName}</strong><br/>
            Pojišťovací specialista
          </div>
          <div style="text-align:center;font-size:9px;color:#94a3b8;">
            LIMMIT s.r.o.<br/>
            © ${new Date().getFullYear()}
          </div>
          <div style="text-align:right;">
            ${clientData.brokerPhone}<br/>
            <span style="color:#009ee3;">${clientData.brokerEmail}</span>
          </div>
        </div>
      </div>
    `;

    // Create temporary container
    const container = document.createElement("div");
    container.innerHTML = pdfHtml;
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: ${A4_WIDTH_PX}px;
      height: ${A4_HEIGHT_PX}px;
      background: white;
      z-index: -9999;
      visibility: visible;
      opacity: 1;
    `;
    document.body.appendChild(container);

    // Wait for render
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Get the actual element to render
    const elementToRender = container.querySelector("div");
    if (!elementToRender) {
      document.body.removeChild(container);
      throw new Error("PDF element not found");
    }

    // Render canvas
    let canvas;
    try {
      canvas = await html2canvas(elementToRender as HTMLElement, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        logging: false,
        allowTaint: true,
      });
    } catch (canvasError) {
      document.body.removeChild(container);
      throw new Error("Canvas render failed: " + (canvasError as Error).message);
    }

    document.body.removeChild(container);

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error("Canvas is empty");
    }

    const imgData = canvas.toDataURL("image/png", 1.0);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: false,
      putOnlyUsedFonts: true,
    });

    // Exact A4 dimensions
    const pageWidth = 210;
    const pageHeight = 297;

    // Add image to fill exactly one A4 page
    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pageHeight, undefined, "NONE");

    const clientName = (clientData.name || "klient").replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `Nabidka_${clientName}_${dateStr}.pdf`;

    const blob = pdf.output("blob");
    return { blob, fileName, pdf };
  };

  const downloadPdf = async () => {
    try {
      showNotification("Generuji PDF...", "info");
      const result = await generatePdfAttachment();
      result.pdf.save(result.fileName);
      showNotification("PDF bylo úspěšně staženo.", "success");
    } catch (err) {
      console.error("PDF generation error:", err);
      showNotification("Nepodařilo se vygenerovat PDF: " + (err as Error).message, "error");
    }
  };

  // --- UI ---
  return (
    <ModuleShell user={currentUser} title="Kalkulace pojištění auta" section="Auto · pojištění" subtitle="Připravte varianty pojištění a přehlednou nabídku pro klienta."
      items={[
        { label: "Editace nabídky", icon: icons.edit, active: activeTab === "offer", onClick: () => setActiveTab("offer") },
        { label: "Náhled a export", icon: icons.printer, active: activeTab === "preview", onClick: () => setActiveTab("preview") },
      ]}
      actions={<>
        <button className="module-action module-action-primary" onClick={() => { setSaveName(saveName || clientData.name || "Nová kalkulace"); setShowSaveModal(true); }}>{icons.upload} Uložit</button>
        <button className="module-action" onClick={() => { fetchCalculations(); setShowLoadModal(true); }}>{icons.folder} Načíst</button>
        <button className="module-action" onClick={handleNewCalculation}>{icons.plus} Nová kalkulace</button>
      </>}>

      {/* NOTIFICATION */}
      {notification && (
        <div
          className={`module-notice fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-xl shadow-2xl text-white flex items-center gap-3 font-medium animate-fade-in ${
            notification.type === "error"
              ? "bg-red-500"
              : notification.type === "info"
              ? "bg-[#147d70]"
              : "bg-[#147d70]"
          }`}
        >
          {icons.checkCircle}
          {notification.msg}
        </div>
      )}

      {/* SAVE MODAL */}
      {showSaveModal && (
        <div className="fixed inset-0 p-4 bg-[#102e32]/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-[#e4e9e8] shadow-2xl">
            <h3 className="text-xl font-bold text-[#182d35] mb-4 flex items-center gap-2">
              {icons.upload} Uložit kalkulaci
            </h3>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Název kalkulace..."
              className="w-full p-3 bg-[#f1f5f3] border border-[#d6e0dc] rounded-lg text-[#182d35] mb-4 outline-none focus:ring-2 focus:ring-[#67c7b5]"
              onKeyDown={(e) => e.key === "Enter" && saveToCloud()}
              autoFocus
            />
            {currentCalculationId && (
              <p className="text-sm text-[#71828a] mb-4">
                ✏️ Aktualizujete existující kalkulaci
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-lg bg-[#f1f5f3] text-[#526c65] hover:bg-[#e4e9e8] transition-all"
              >
                Zrušit
              </button>
              <button
                onClick={saveToCloud}
                className="px-6 py-2 rounded-lg bg-[#147d70] text-white font-bold hover:bg-[#106451] transition-all flex items-center gap-2"
              >
                {icons.save} Uložit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOAD MODAL */}
      {showLoadModal && (
        <div className="fixed inset-0 p-4 bg-[#102e32]/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg border border-[#e4e9e8] shadow-2xl max-h-[80vh] flex flex-col">
            <h3 className="text-xl font-bold text-[#182d35] mb-4 flex items-center gap-2">
              {icons.folder} Načíst kalkulaci
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {savedCalculations.length === 0 ? (
                <p className="text-[#71828a] text-center py-8">Nemáte žádné uložené kalkulace.</p>
              ) : (
                savedCalculations.map((calc) => (
                  <div
                    key={calc.id}
                    className={`p-4 rounded-lg border transition-all cursor-pointer hover:bg-[#f1f5f3] ${
                      currentCalculationId === calc.id
                        ? "border-[#147d70] bg-[#f1f5f3]"
                        : "border-[#d6e0dc] bg-[#f5f7f6]"
                    }`}
                    onClick={() => loadCalculation(calc)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-[#182d35]">{calc.name}</div>
                        <div className="text-sm text-[#71828a]">
                          {calc.client_data?.name || "Bez klienta"} • {calc.client_data?.car || "Bez vozidla"}
                        </div>
                        <div className="text-xs text-[#71828a] mt-1">
                          {new Date(calc.updated_at).toLocaleDateString("cs-CZ", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCalculation(calc.id);
                        }}
                        className="text-[#71828a] hover:text-red-500 p-1"
                      >
                        {icons.trash}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowLoadModal(false)}
                className="px-4 py-2 rounded-lg bg-[#f1f5f3] text-[#526c65] hover:bg-[#e4e9e8] transition-all"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}



      <main className="module-content">
        {/* CLIENT FORM */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#e4e9e8] p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-[#182d35] flex items-center gap-2">
              {icons.user} Údaje o klientovi
            </h2>
            <button onClick={() => setIsEditing(!isEditing)} className="text-[#147d70] text-sm font-semibold hover:underline">
              {isEditing ? "Ukončit úpravy" : "Upravit údaje"}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className="block text-xs font-bold text-[#71828a] uppercase mb-1">Jméno a Příjmení</label>
              {isEditing ? (
                <input
                  value={clientData.name}
                  onChange={(e) => setClientData({ ...clientData, name: e.target.value })}
                  className="w-full p-2 bg-[#f1f5f3] border border-[#d6e0dc] rounded focus:ring-2 focus:ring-[#67c7b5] outline-none font-medium text-[#182d35]"
                />
              ) : (
                <p className="text-lg font-semibold text-[#182d35]">{clientData.name || "-"}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-[#71828a] uppercase mb-1">Vozidlo</label>
              {isEditing ? (
                <input
                  value={clientData.car}
                  onChange={(e) => setClientData({ ...clientData, car: e.target.value })}
                  className="w-full p-2 bg-[#f1f5f3] border border-[#d6e0dc] rounded focus:ring-2 focus:ring-[#67c7b5] outline-none font-medium text-[#182d35]"
                />
              ) : (
                <p className="text-lg font-semibold text-[#182d35]">{clientData.car || "-"}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-[#71828a] uppercase mb-1">Pojistná částka</label>
              {isEditing ? (
                <input
                  type="number"
                  value={clientData.carValue}
                  onChange={(e) => setClientData({ ...clientData, carValue: e.target.value })}
                  className="w-full p-2 bg-[#f1f5f3] border border-[#d6e0dc] rounded focus:ring-2 focus:ring-[#67c7b5] outline-none font-medium text-[#182d35]"
                  placeholder="Kč"
                />
              ) : (
                <p className="text-lg font-bold text-[#147d70]">{formatCurrency(clientData.carValue)}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-[#71828a] uppercase mb-1">Adresa</label>
              {isEditing ? (
                <input
                  value={clientData.address}
                  onChange={(e) => setClientData({ ...clientData, address: e.target.value })}
                  className="w-full p-2 bg-[#f1f5f3] border border-[#d6e0dc] rounded focus:ring-2 focus:ring-[#67c7b5] outline-none font-medium text-[#182d35]"
                />
              ) : (
                <p className="text-base text-[#526c65]">{clientData.address || "-"}</p>
              )}
            </div>
          </div>
        </div>

        {/* EDITOR TAB */}
        {activeTab === "offer" && (
          <div className="animate-fade-in">
            {isEditing && (
              <div className="bg-white border border-[#e4e9e8] rounded-xl p-4 mb-8 flex flex-wrap items-center gap-4">
                <span className="text-xs font-bold text-[#71828a] uppercase flex items-center gap-2">
                  {icons.settings} Globální připojištění:
                </span>
                {moduleTypes.map((t) => (
                  <span key={t.id} className="bg-[#f1f5f3] px-3 py-1 rounded-full text-sm border border-[#d6e0dc] flex items-center gap-2 shadow-sm">
                    {t.name}
                    <button onClick={() => removeModuleType(t.id)} className="text-[#71828a] hover:text-red-500">
                      {icons.x}
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-2 ml-auto">
                  <input
                    value={newModuleTypeName}
                    onChange={(e) => setNewModuleTypeName(e.target.value)}
                    placeholder="Název..."
                    className="p-1.5 px-3 text-sm border border-[#d6e0dc] bg-[#f1f5f3] rounded-lg outline-none w-40 focus:ring-2 focus:ring-[#67c7b5] text-[#182d35]"
                    onKeyDown={(e) => e.key === "Enter" && addModuleType()}
                  />
                  <button onClick={addModuleType} className="bg-[#f1f5f3] p-1.5 border border-[#d6e0dc] rounded-lg hover:bg-[#e4e9e8] text-[#147d70]">
                    {icons.plus}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-[#182d35]">Kalkulace variant</h2>
              {isEditing && (
                <button onClick={addOffer} className="bg-[#147d70] text-white px-4 py-2 rounded-lg hover:bg-[#106451] shadow-md flex items-center gap-2 text-sm font-medium">
                  {icons.plus} Přidat variantu
                </button>
              )}
            </div>

            <div className="flex gap-6 overflow-x-auto pb-10 items-start snap-x">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className={`snap-center shrink-0 w-full md:w-[400px] bg-white rounded-2xl shadow-lg border-t-4 flex flex-col relative transition-all ${
                    offer.selected ? "border-[#147d70] ring-4 ring-[#147d70]/15" : "border-[#d6e0dc]"
                  }`}
                >
                  {/* HEADER */}
                  <div className="p-6 border-b border-[#e4e9e8] bg-[#f5f7f6] rounded-t-xl">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        {isEditing ? (
                          <>
                            <select
                              value={offer.insurer}
                              onChange={(e) => handleOfferChange(offer.id, "root", "insurer", e.target.value)}
                              className="w-full p-2 mb-2 border border-[#d6e0dc] bg-[#f1f5f3] rounded font-bold text-[#182d35]"
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
                              className="w-1/2 text-sm bg-transparent border-b border-dashed border-[#d6e0dc] outline-none text-[#71828a]"
                            />
                          </>
                        ) : (
                          <>
                            <h3 className="text-xl font-bold text-[#182d35] mb-1">{offer.insurer}</h3>
                            <p className="text-sm text-[#71828a]">{offer.title}</p>
                          </>
                        )}
                      </div>
                      {isEditing && (
                        <button 
                          onClick={() => removeOffer(offer.id)} 
                          className="ml-2 p-2 rounded-lg bg-red-500/10 text-red-700 hover:bg-red-500/20 hover:text-red-700 transition-all"
                          title="Odstranit variantu"
                        >
                          {icons.trash}
                        </button>
                      )}
                    </div>
                    <div className="text-right mt-2">
                      <div className="text-3xl font-bold text-[#147d70]">{formatCurrency(calculateTotal(offer))}</div>
                      <div className="text-xs font-bold text-[#71828a] uppercase tracking-wider">Ročně</div>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* LIABILITY */}
                    <div
                      className={`p-4 rounded-xl border transition-colors ${
                        offer.liability.active ? "bg-[#edf6f2] border-[#c9e3da]" : "bg-[#f5f7f6] border-[#e4e9e8] opacity-60"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          {isEditing && (
                            <input
                              type="checkbox"
                              checked={offer.liability.active}
                              onChange={() => handleOfferChange(offer.id, "liability", "active", !offer.liability.active)}
                              className="w-4 h-4 text-[#147d70] rounded"
                            />
                          )}
                          <span className="font-bold text-sm text-[#182d35]">Povinné ručení</span>
                        </div>
                        {isEditing ? (
                          <input
                            type="number"
                            value={offer.liability.price}
                            onChange={(e) => handleOfferChange(offer.id, "liability", "price", e.target.value)}
                            className="w-24 text-right p-1 border border-[#d6e0dc] bg-[#f1f5f3] rounded text-sm font-bold text-[#182d35]"
                            placeholder="0"
                          />
                        ) : (
                          <span className="font-bold text-[#182d35]">{formatCurrency(offer.liability.price)}</span>
                        )}
                      </div>
                      {offer.liability.active && (
                        <div className="flex items-center gap-2 pl-6">
                          {isEditing ? (
                            <div className="flex items-center w-full bg-[#f1f5f3] border border-[#d6e0dc] rounded px-2">
                              <input
                                type="number"
                                value={offer.liability.limit}
                                onChange={(e) => handleOfferChange(offer.id, "liability", "limit", e.target.value)}
                                className="w-full p-1 text-sm outline-none bg-transparent text-[#182d35]"
                                placeholder="35"
                              />
                              <span className="text-xs text-[#71828a] whitespace-nowrap">mil. Kč</span>
                            </div>
                          ) : (
                            <span className="text-sm text-[#526c65]">
                              Limit: <strong>{offer.liability.limit} mil. Kč</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ALLRISK */}
                    <div
                      className={`p-4 rounded-xl border transition-colors ${
                        offer.allrisk.active ? "bg-[#edf6f2] border-[#c9e3da]" : "bg-[#f5f7f6] border-[#e4e9e8] opacity-60"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          {isEditing && (
                            <input
                              type="checkbox"
                              checked={offer.allrisk.active}
                              onChange={() => handleOfferChange(offer.id, "allrisk", "active", !offer.allrisk.active)}
                              className="w-4 h-4 text-[#147d70] rounded"
                            />
                          )}
                          <span className="font-bold text-sm text-[#182d35]">Havarijní (Allrisk)</span>
                        </div>
                        {isEditing ? (
                          <input
                            type="number"
                            value={offer.allrisk.price}
                            onChange={(e) => handleOfferChange(offer.id, "allrisk", "price", e.target.value)}
                            className="w-24 text-right p-1 border border-[#d6e0dc] bg-[#f1f5f3] rounded text-sm font-bold text-[#182d35]"
                            placeholder="0"
                          />
                        ) : (
                          <span className="font-bold text-[#182d35]">{formatCurrency(offer.allrisk.price)}</span>
                        )}
                      </div>

                      {offer.allrisk.active && (
                        <div className="pl-6 space-y-3">
                          {/* Limit */}
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-[#71828a]">Pojistná částka</label>
                            {isEditing ? (
                              <div className="flex items-center w-full bg-[#f1f5f3] border border-[#d6e0dc] rounded px-2">
                                <input
                                  type="number"
                                  value={offer.allrisk.limit}
                                  onChange={(e) => handleOfferChange(offer.id, "allrisk", "limit", e.target.value)}
                                  className="w-full p-1 text-sm outline-none bg-transparent text-[#182d35]"
                                  placeholder="0"
                                />
                                <span className="text-xs text-[#71828a]">Kč</span>
                              </div>
                            ) : (
                              <div className="text-sm font-semibold text-[#526c65]">{formatCurrency(offer.allrisk.limit)}</div>
                            )}
                          </div>

                          {/* Deductible */}
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-[#71828a]">Spoluúčast</label>
                            {isEditing ? (
                              <div className="flex gap-2">
                                <select
                                  value={offer.allrisk.pct}
                                  onChange={(e) => handleOfferChange(offer.id, "allrisk", "pct", e.target.value)}
                                  className="w-1/2 p-1 text-sm border border-[#d6e0dc] bg-[#f1f5f3] rounded text-[#182d35]"
                                >
                                  <option value="0">0%</option>
                                  <option value="5">5%</option>
                                  <option value="10">10%</option>
                                  <option value="20">20%</option>
                                </select>
                                <select
                                  value={offer.allrisk.min}
                                  onChange={(e) => handleOfferChange(offer.id, "allrisk", "min", e.target.value)}
                                  className="w-1/2 p-1 text-sm border border-[#d6e0dc] bg-[#f1f5f3] rounded text-[#182d35]"
                                >
                                  <option value="1000">1 000 Kč</option>
                                  <option value="5000">5 000 Kč</option>
                                  <option value="10000">10 000 Kč</option>
                                  <option value="20000">20 000 Kč</option>
                                </select>
                              </div>
                            ) : (
                              <div className="text-sm text-[#526c65]">
                                {offer.allrisk.pct}%, min. {new Intl.NumberFormat("cs-CZ").format(offer.allrisk.min)} Kč
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* MODULES */}
                    <div>
                      <div className="text-xs font-bold uppercase text-[#71828a] mb-2">Připojištění</div>
                      <div className="space-y-2">
                        {moduleTypes.map((t) => {
                          const m = offer.modules[t.id] || { active: false, price: 0, limit: "" };
                          if (!isEditing && !m.active) return null;
                          return (
                            <div
                              key={t.id}
                              className={`flex items-center justify-between p-2 rounded border ${
                                m.active ? "bg-[#f1f5f3] border-[#d6e0dc]" : "bg-transparent border-transparent opacity-50"
                              }`}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                {isEditing && (
                                  <input
                                    type="checkbox"
                                    checked={m.active}
                                    onChange={() => handleModuleChange(offer.id, t.id, "active")}
                                    className="w-4 h-4 text-[#147d70] rounded flex-shrink-0"
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-[#526c65] truncate">{t.name}</div>
                                  {m.active &&
                                    (isEditing ? (
                                      <input
                                        type="text"
                                        value={m.limit}
                                        onChange={(e) => handleModuleChange(offer.id, t.id, "limit", e.target.value)}
                                        className="text-xs border-b border-[#d6e0dc] bg-transparent w-full outline-none text-[#71828a]"
                                        placeholder="Popis/Limit"
                                      />
                                    ) : (
                                      <div className="text-xs text-[#71828a] truncate">{m.limit}</div>
                                    ))}
                                </div>
                              </div>
                              {m.active &&
                                (isEditing ? (
                                  <input
                                    type="number"
                                    value={m.price}
                                    onChange={(e) => handleModuleChange(offer.id, t.id, "price", e.target.value)}
                                    className="w-16 text-right p-1 border border-[#d6e0dc] bg-[#f1f5f3] rounded text-xs font-bold text-[#182d35]"
                                    placeholder="0"
                                  />
                                ) : (
                                  <div className="text-sm font-bold whitespace-nowrap pl-2 text-[#182d35]">{formatCurrency(m.price)}</div>
                                ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto p-4 border-t border-[#e4e9e8] bg-[#f5f7f6] rounded-b-xl text-center">
                    <button
                      onClick={() => !isEditing && setOffers((prev) => prev.map((o) => ({ ...o, selected: o.id === offer.id })))}
                      className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                        offer.selected ? "bg-[#147d70] text-white shadow-sm" : "bg-[#f1f5f3] border border-[#d6e0dc] text-[#71828a] hover:bg-[#e4e9e8]"
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
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-[#e4e9e8] mb-8">
              <div className="p-8 text-center border-b border-[#e4e9e8] bg-[#f5f7f6]">
                <h2 className="text-2xl font-bold text-[#182d35]">Náhled před odesláním</h2>
                <p className="text-[#71828a] mb-6">Zkontrolujte údaje a vyberte způsob exportu.</p>
                <div className="flex flex-wrap justify-center gap-4">
                  <button
                    onClick={downloadPdf}
                    className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-red-700 transition-all flex items-center gap-2"
                  >
                    {icons.fileText} Stáhnout PDF
                  </button>
                  <button
                    onClick={copyEmailText}
                    className="bg-[#147d70] text-white px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-[#106451] transition-all flex items-center gap-2"
                  >
                    {icons.copy} Kopírovat text
                  </button>
                  <button
                    onClick={copyEmailHtml}
                    className="bg-[#526c65] text-white px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-[#3d5750] transition-all flex items-center gap-2"
                  >
                    {icons.fileText} Kopírovat HTML
                  </button>
                  <button
                    onClick={sendEmail}
                    className="bg-[#147d70] text-white px-8 py-3 rounded-xl font-bold shadow-sm hover:bg-[#147d70] transition-all flex items-center gap-2"
                  >
                    {icons.mail} Odeslat e-mailem
                  </button>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-white p-4 rounded-2xl shadow-inner border border-[#e4e9e8]">
              <div className="text-center text-xs text-[#71828a] mb-4 font-medium">NÁHLED NABÍDKY</div>
              <div className="bg-[#f5f7f6] rounded-xl p-6 border border-[#e4e9e8]">
                {/* Client Info */}
                <div className="mb-6 p-4 bg-white rounded-lg border-l-4 border-[#147d70]">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-[#71828a]">Klient:</div>
                    <div className="font-bold text-[#182d35]">{clientData.name || "-"}</div>
                    <div className="text-[#71828a]">Vozidlo:</div>
                    <div className="font-bold text-[#182d35]">{clientData.car || "-"}</div>
                    <div className="text-[#71828a]">Pojistná částka:</div>
                    <div className="font-bold text-[#147d70]">{formatCurrency(clientData.carValue)}</div>
                    <div className="text-[#71828a]">Adresa:</div>
                    <div className="font-bold text-[#182d35]">{clientData.address || "-"}</div>
                  </div>
                </div>

                {/* Offers Grid */}
                <div className={`grid gap-4 ${offers.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"}`}>
                  {offers.slice(0, 4).map((offer) => (
                    <div
                      key={offer.id}
                      className={`rounded-xl overflow-hidden border ${
                        offer.selected ? "border-[#147d70] ring-2 ring-[#147d70]/15" : "border-[#e4e9e8]"
                      }`}
                    >
                      {offer.selected && (
                        <div className="bg-[#147d70] text-white text-center text-xs font-bold py-1 uppercase">★ Doporučená</div>
                      )}
                      <div className="p-4 bg-white text-center border-b border-[#e4e9e8]">
                        <div className="text-sm font-bold text-[#182d35]">{offer.insurer}</div>
                        <div className="text-xs text-[#71828a]">{offer.title}</div>
                        <div className="text-xl font-bold text-[#147d70] mt-2">{formatCurrency(calculateTotal(offer))}</div>
                        <div className="text-xs text-[#71828a] uppercase">Ročně</div>
                      </div>
                      <div className="p-3 bg-[#f5f7f6] text-xs space-y-1">
                        {offer.liability.active && (
                          <div className="flex justify-between">
                            <span className="text-[#71828a]">POV ({offer.liability.limit} mil.)</span>
                            <span className="font-bold text-[#182d35]">{formatCurrency(offer.liability.price)}</span>
                          </div>
                        )}
                        {offer.allrisk.active && (
                          <div className="flex justify-between">
                            <span className="text-[#71828a]">Havarijní</span>
                            <span className="font-bold text-[#182d35]">{formatCurrency(offer.allrisk.price)}</span>
                          </div>
                        )}
                        {moduleTypes.map((t) => {
                          const m = offer.modules[t.id];
                          if (!m?.active) return null;
                          return (
                            <div key={t.id} className="flex justify-between">
                              <span className="text-[#71828a]">{t.name}</span>
                              <span className="font-bold text-[#182d35]">{formatCurrency(m.price)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Broker Info */}
                <div className="mt-6 pt-4 border-t border-[#e4e9e8] flex justify-between text-sm">
                  <div>
                    <div className="font-bold text-[#182d35]">{clientData.brokerName}</div>
                    <div className="text-[#71828a]">Pojišťovací specialista</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#182d35]">{clientData.brokerPhone}</div>
                    <div className="text-[#147d70]">{clientData.brokerEmail}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </ModuleShell>
  );
}

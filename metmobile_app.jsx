import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Copy, MapPin, Mail, Plus, Trash2, Pencil, LocateFixed, Save, X } from "lucide-react";

// Leaflet marker icon fix for many bundlers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MATERIAL_CATALOG = {
  Direk: [
    { code: "1.001", name: "Beton Direk" },
    { code: "1.002", name: "Demir Direk" },
    { code: "1.003", name: "Aydınlatma Direği" },
  ],
  Travers: [
    { code: "1.101", name: "AG Travers" },
    { code: "1.102", name: "OG Travers" },
    { code: "1.103", name: "Konsol Travers" },
  ],
  İzolatör: [
    { code: "1.201", name: "AG İzolatör" },
    { code: "1.202", name: "OG İzolatör" },
    { code: "1.203", name: "Mesnet İzolatör" },
  ],
  İletken: [
    { code: "1.301", name: "AG İletken" },
    { code: "1.302", name: "OG İletken" },
    { code: "1.303", name: "Nötr İletken" },
  ],
  Aksesuar: [
    { code: "1.401", name: "Bağ Teli" },
    { code: "1.402", name: "Kelepçe" },
    { code: "1.403", name: "Civata Seti" },
  ],
  Demontaj: [
    { code: "6.001", name: "Demontaj Direk" },
    { code: "6.101", name: "Demontaj Travers" },
    { code: "6.201", name: "Demontaj İzolatör" },
  ],
};

const STORAGE_KEYS = {
  points: "saha-demo-points",
  logs: "saha-demo-logs",
  mail: "saha-demo-mail",
  project: "saha-demo-project",
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function PointCreator({ onAdd }) {
  useMapEvents({
    click(e) {
      onAdd(e.latlng);
    },
  });
  return null;
}

function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, 17);
  }, [center, map]);
  return null;
}

function findMaterialByCode(code) {
  for (const [category, items] of Object.entries(MATERIAL_CATALOG)) {
    const found = items.find((i) => i.code === code);
    if (found) return { ...found, category };
  }
  return null;
}

function getSuggestions(selectedItems, logs) {
  const selectedCodes = new Set(selectedItems.map((x) => x.code));
  const hitCounts = {};

  logs.forEach((log) => {
    const codes = log.items.map((x) => x.code);
    const hasOverlap = codes.some((code) => selectedCodes.has(code));
    if (!hasOverlap) return;

    codes.forEach((code) => {
      if (!selectedCodes.has(code)) {
        hitCounts[code] = (hitCounts[code] || 0) + 1;
      }
    });
  });

  return Object.entries(hitCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, score]) => {
      const material = findMaterialByCode(code);
      return material ? { ...material, score } : null;
    })
    .filter(Boolean);
}

function aggregateDiscovery(points, projectName) {
  const rows = {};
  points.forEach((point) => {
    point.items.forEach((item) => {
      const key = `${projectName}__${item.code}__${item.name}`;
      if (!rows[key]) {
        rows[key] = {
          project: projectName,
          code: item.code,
          material: item.name,
          quantity: 0,
        };
      }
      rows[key].quantity += Number(item.quantity || 0);
    });
  });
  return Object.values(rows).sort((a, b) => a.material.localeCompare(b.material, "tr"));
}

function App() {
  const [projectName, setProjectName] = useState(() => load(STORAGE_KEYS.project, "Örnek Elektrik Dağıtım Projesi"));
  const [email, setEmail] = useState(() => load(STORAGE_KEYS.mail, ""));
  const [points, setPoints] = useState(() => load(STORAGE_KEYS.points, []));
  const [logs, setLogs] = useState(() => load(STORAGE_KEYS.logs, []));
  const [selectedPointId, setSelectedPointId] = useState(null);
  const [draftCategory, setDraftCategory] = useState("Direk");
  const [draftCode, setDraftCode] = useState(MATERIAL_CATALOG["Direk"][0].code);
  const [draftQty, setDraftQty] = useState(1);
  const [userLocation, setUserLocation] = useState(null);
  const [copyModeId, setCopyModeId] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => save(STORAGE_KEYS.project, projectName), [projectName]);
  useEffect(() => save(STORAGE_KEYS.mail, email), [email]);
  useEffect(() => save(STORAGE_KEYS.points, points), [points]);
  useEffect(() => save(STORAGE_KEYS.logs, logs), [logs]);

  useEffect(() => {
    const timer = toast ? setTimeout(() => setToast(""), 2200) : null;
    return () => timer && clearTimeout(timer);
  }, [toast]);

  const selectedPoint = useMemo(
    () => points.find((p) => p.id === selectedPointId) || null,
    [points, selectedPointId]
  );

  const summary = useMemo(() => aggregateDiscovery(points, projectName), [points, projectName]);
  const suggestions = useMemo(
    () => getSuggestions(selectedPoint?.items || [], logs),
    [selectedPoint, logs]
  );

  function addPoint(latlng) {
    if (copyModeId) {
      const source = points.find((p) => p.id === copyModeId);
      if (!source) return;
      const clone = {
        ...source,
        id: uid(),
        name: `${source.name} Kopya`,
        lat: latlng.lat,
        lng: latlng.lng,
        items: source.items.map((i) => ({ ...i, rowId: uid() })),
      };
      setPoints((prev) => [...prev, clone]);
      setSelectedPointId(clone.id);
      setCopyModeId(null);
      setToast("Nokta tüm malzemeleriyle kopyalandı.");
      return;
    }

    const newPoint = {
      id: uid(),
      name: `Nokta ${points.length + 1}`,
      lat: latlng.lat,
      lng: latlng.lng,
      items: [],
      createdAt: new Date().toISOString(),
    };
    setPoints((prev) => [...prev, newPoint]);
    setSelectedPointId(newPoint.id);
    setToast("Yeni nokta oluşturuldu.");
  }

  function updateSelectedPoint(patch) {
    if (!selectedPointId) return;
    setPoints((prev) => prev.map((p) => (p.id === selectedPointId ? { ...p, ...patch } : p)));
  }

  function addMaterialToPoint(material) {
    if (!selectedPoint) return;

    const entry = {
      rowId: uid(),
      code: material.code,
      name: material.name,
      category: material.category,
      quantity: Number(draftQty || 1),
    };

    const newItems = [...selectedPoint.items, entry];
    updateSelectedPoint({ items: newItems });

    const setLog = {
      id: uid(),
      pointId: selectedPoint.id,
      timestamp: new Date().toISOString(),
      items: newItems.map((x) => ({ code: x.code, name: x.name, category: x.category })),
    };
    setLogs((prev) => [setLog, ...prev].slice(0, 300));
    setToast(`${material.name} eklendi.`);
  }

  function removeMaterial(rowId) {
    if (!selectedPoint) return;
    updateSelectedPoint({ items: selectedPoint.items.filter((x) => x.rowId !== rowId) });
  }

  function updateMaterial(rowId, patch) {
    if (!selectedPoint) return;
    updateSelectedPoint({
      items: selectedPoint.items.map((x) => (x.rowId === rowId ? { ...x, ...patch } : x)),
    });
  }

  function removePoint(id) {
    setPoints((prev) => prev.filter((p) => p.id !== id));
    if (selectedPointId === id) setSelectedPointId(null);
    if (copyModeId === id) setCopyModeId(null);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setToast("Tarayıcı konum özelliğini desteklemiyor.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(coords);
        setToast("Mevcut konum gösterildi.");
      },
      () => setToast("Konum alınamadı. İzin vermeniz gerekebilir."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function exportCsvAndMail() {
    const rows = aggregateDiscovery(points, projectName);
    if (!rows.length) {
      setToast("Gönderilecek keşif listesi henüz oluşmadı.");
      return;
    }

    const csv = [
      ["Proje", "Kod", "Malzeme", "Miktar"],
      ...rows.map((r) => [r.project, r.code, r.material, r.quantity]),
    ]
      .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, "_")}_kesif.csv`;
    a.click();
    URL.revokeObjectURL(url);

    const mailBody = [
      `${projectName} için keşif özeti hazırlanmıştır.`,
      "",
      ...rows.map((r) => `- ${r.material} (${r.code}): ${r.quantity}`),
      "",
      "CSV dosyası tarayıcı üzerinden indirildi. GitHub Pages ortamında doğrudan sunucu taraflı mail gönderimi yerine mail uygulaması açılmaktadır.",
    ].join("\n");

    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(projectName + " - Keşif Listesi")}&body=${encodeURIComponent(mailBody)}`;
    setToast("CSV indirildi ve e-posta taslağı açıldı.");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Saha Hakediş Demo</h1>
              <p className="mt-1 text-sm text-slate-600">
                Haritada nokta oluştur, malzeme seti ekle, kopyala, düzenle ve proje keşfini dışa aktar.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm">
                <div className="mb-1 font-medium">Proje Adı</div>
                <input
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <div className="mb-1 font-medium">E-posta</div>
                <input
                  type="email"
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@firma.com"
                />
              </label>
              <div className="flex gap-2 self-end">
                <button
                  onClick={useMyLocation}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
                >
                  <LocateFixed size={16} /> Konumum
                </button>
                <button
                  onClick={exportCsvAndMail}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  <Mail size={16} /> Gönder
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
              Haritaya tıklayarak yeni nokta ekleyin.
              {copyModeId ? " Şu an kopyalama modu açık: haritada yeni konuma tıklayın." : ""}
            </div>
            <div className="h-[580px] w-full">
              <MapContainer center={[39.92, 32.85]} zoom={6} className="h-full w-full">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <PointCreator onAdd={addPoint} />
                {userLocation && <Recenter center={userLocation} />}
                {userLocation && (
                  <Marker position={userLocation}>
                    <Popup>Mevcut konumunuz</Popup>
                  </Marker>
                )}
                {points.map((point) => (
                  <Marker
                    key={point.id}
                    position={[point.lat, point.lng]}
                    eventHandlers={{ click: () => setSelectedPointId(point.id) }}
                  >
                    <Popup>
                      <div className="min-w-44">
                        <div className="font-semibold">{point.name}</div>
                        <div className="text-xs text-slate-500">
                          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                        </div>
                        <div className="mt-2 text-sm">Malzeme sayısı: {point.items.length}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Noktalar</h2>
                  <p className="text-sm text-slate-500">Seç, düzenle, kopyala veya sil.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {points.length} nokta
                </span>
              </div>

              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {points.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    Henüz nokta yok. Haritaya tıklayarak başlayın.
                  </div>
                )}
                {points.map((point) => (
                  <div
                    key={point.id}
                    className={`rounded-2xl border p-3 ${selectedPointId === point.id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button className="text-left" onClick={() => setSelectedPointId(point.id)}>
                        <div className="font-medium">{point.name}</div>
                        <div className="text-xs text-slate-500">
                          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">{point.items.length} malzeme satırı</div>
                      </button>
                      <div className="flex gap-1">
                        <button
                          title="Kopyala"
                          onClick={() => {
                            setCopyModeId(point.id);
                            setToast("Kopyalama modu açık. Haritada yeni konuma tıklayın.");
                          }}
                          className="rounded-xl border border-slate-200 p-2 hover:bg-slate-100"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          title="Sil"
                          onClick={() => removePoint(point.id)}
                          className="rounded-xl border border-slate-200 p-2 hover:bg-slate-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Seçili Nokta</h2>
                  <p className="text-sm text-slate-500">Malzeme ekleme ve düzenleme alanı</p>
                </div>
                {selectedPoint && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {selectedPoint.items.length} satır
                  </span>
                )}
              </div>

              {!selectedPoint ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  Önce bir nokta seçin veya haritada yeni nokta oluşturun.
                </div>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm">
                      <div className="mb-1 font-medium">Nokta Adı</div>
                      <input
                        className="w-full rounded-2xl border border-slate-300 px-3 py-2"
                        value={selectedPoint.name}
                        onChange={(e) => updateSelectedPoint({ name: e.target.value })}
                      />
                    </label>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <div className="font-medium text-slate-800">Koordinat</div>
                      <div>{selectedPoint.lat.toFixed(5)}, {selectedPoint.lng.toFixed(5)}</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 p-3">
                    <div className="mb-3 text-sm font-medium">Malzeme Ekle</div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <label className="text-sm">
                        <div className="mb-1">Üst Kategori</div>
                        <select
                          value={draftCategory}
                          onChange={(e) => {
                            const category = e.target.value;
                            setDraftCategory(category);
                            setDraftCode(MATERIAL_CATALOG[category][0].code);
                          }}
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2"
                        >
                          {Object.keys(MATERIAL_CATALOG).map((category) => (
                            <option key={category}>{category}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm md:col-span-2">
                        <div className="mb-1">Malzeme</div>
                        <select
                          value={draftCode}
                          onChange={(e) => setDraftCode(e.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2"
                        >
                          {MATERIAL_CATALOG[draftCategory].map((item) => (
                            <option key={item.code} value={item.code}>
                              {item.code} - {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        <div className="mb-1">Miktar</div>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={draftQty}
                          onChange={(e) => setDraftQty(e.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2"
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          const material = findMaterialByCode(draftCode);
                          if (material) addMaterialToPoint(material);
                        }}
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                      >
                        <Plus size={16} /> Ekle
                      </button>
                      {copyModeId && (
                        <button
                          onClick={() => setCopyModeId(null)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
                        >
                          <X size={16} /> Kopyalamayı İptal Et
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-sm font-medium">Malzeme Listesi</div>
                    <div className="max-h-64 space-y-2 overflow-auto pr-1">
                      {selectedPoint.items.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                          Bu noktada henüz malzeme yok.
                        </div>
                      )}
                      {selectedPoint.items.map((item) => (
                        <div key={item.rowId} className="grid grid-cols-[1.5fr_110px_40px] items-center gap-2 rounded-2xl border border-slate-200 p-2">
                          <div>
                            <div className="text-sm font-medium">{item.name}</div>
                            <div className="text-xs text-slate-500">{item.category} · {item.code}</div>
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => updateMaterial(item.rowId, { quantity: Number(e.target.value) })}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                          />
                          <button
                            onClick={() => removeMaterial(item.rowId)}
                            className="rounded-xl border border-slate-200 p-2 hover:bg-slate-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 text-sm font-medium">Öneriler (geçmiş loglara göre)</div>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.length === 0 && (
                        <div className="text-sm text-slate-500">Henüz öneri üretilemedi. Birkaç kombinasyon kayıt edildiğinde öneriler burada görünecek.</div>
                      )}
                      {suggestions.map((s) => (
                        <button
                          key={s.code}
                          onClick={() => addMaterialToPoint(s)}
                          className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                        >
                          {s.name} ({s.code}) · {s.score}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Proje Keşif Özeti</h2>
              <p className="text-sm text-slate-500">Proje - malzeme - miktar bazında konsolide liste</p>
            </div>
            <button
              onClick={exportCsvAndMail}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              <Save size={16} /> CSV + Mail
            </button>
          </div>

          <div className="overflow-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Proje</th>
                  <th className="px-4 py-3 font-medium">Kod</th>
                  <th className="px-4 py-3 font-medium">Malzeme</th>
                  <th className="px-4 py-3 font-medium">Miktar</th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-slate-500">
                      Henüz keşif özeti oluşmadı.
                    </td>
                  </tr>
                )}
                {summary.map((row) => (
                  <tr key={`${row.code}-${row.material}`} className="border-t border-slate-200">
                    <td className="px-4 py-3">{row.project}</td>
                    <td className="px-4 py-3">{row.code}</td>
                    <td className="px-4 py-3">{row.material}</td>
                    <td className="px-4 py-3">{row.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;

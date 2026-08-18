import React, { useEffect, useRef, useState } from "react";
import api from "../../lib/api";
import { formatDateShort } from "../../lib/utils";

interface Dataset {
  id: number;
  title: string;
  category: string;
  source: string;
  years_covered: string | null;
  upload_date: string;
  last_updated: string;
  record_count: number | null;
  processing_status: string;
  confidence: string;
  notes: string | null;
  is_fixture: boolean;
  last_import_at: string | null;
}

interface IngestionJob {
  id: number;
  file_name: string;
  status: string;
  total_rows: number | null;
  rows_imported: number;
  rows_errored: number;
  started_at: string;
  dataset_title: string | null;
  triggered_by_name: string | null;
}

const confidenceColor: Record<string, string> = {
  strong:     "text-text-green",
  moderate:   "text-teal",
  limited:    "text-status-pending",
  incomplete: "text-text-red",
};

const statusColor: Record<string, string> = {
  preview:    "text-status-pending",
  mapped:     "text-teal",
  processing: "text-blue-400",
  complete:   "text-text-green",
  error:      "text-text-red",
  cancelled:  "text-text-muted",
};

export default function AdminDataLibrary({
  onNavigateIngestion,
}: {
  onNavigateIngestion?: (jobId: number) => void;
}) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    title: "", category: "draft", source: "",
    yearsCovered: "", recordCount: "", confidence: "moderate", notes: "",
  });
  const [formSuccess, setFormSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    Promise.all([
      api.get<Dataset[]>("/admin/data-library"),
      api.get<IngestionJob[]>("/admin/ingestion"),
    ]).then(([dl, ij]) => {
      if (dl.ok) setDatasets(dl.data);
      if (ij.ok) setJobs(ij.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
      setUploadError("Only XLSX, XLS, and CSV files are accepted.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadProgress(`Uploading ${file.name}…`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/ingestion/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (json.existingJobId) {
          setUploadError(
            `This exact file has already been uploaded (Job #${json.existingJobId}). Use the existing job to review.`
          );
        } else {
          setUploadError(json.error ?? "Upload failed.");
        }
        setUploading(false);
        setUploadProgress(null);
        return;
      }

      setUploadProgress(
        `Parsed ${json.data.totalWorksheets} worksheets · ${json.data.totalDataRows?.toLocaleString()} data rows detected.`
      );

      // Reload the job list then navigate to review
      load();
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(null);
        if (onNavigateIngestion) onNavigateIngestion(json.data.jobId);
      }, 800);
    } catch (err) {
      setUploadError("Network error during upload.");
      setUploading(false);
      setUploadProgress(null);
    }

    // Reset the file input so the same file can be re-selected if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post("/admin/data-library", {
      ...form,
      recordCount: form.recordCount ? parseInt(form.recordCount) : undefined,
    });
    if (res.ok) {
      setFormSuccess("Dataset record added.");
      setAdding(false);
      setForm({ title: "", category: "draft", source: "", yearsCovered: "", recordCount: "", confidence: "moderate", notes: "" });
      load();
    }
  };

  const recentJobs = jobs.slice(0, 8);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">DATA LIBRARY</h1>
          <p className="text-text-secondary text-sm mt-1">OSM intelligence datasets and ingestion pipeline.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAdding(!adding)}
            className="diq-btn-secondary text-xs"
          >
            + METADATA ONLY
          </button>
          <label className={`diq-btn-primary text-xs cursor-pointer ${uploading ? "opacity-60 cursor-not-allowed" : ""}`}>
            {uploading ? "UPLOADING…" : "⬆ UPLOAD FILE"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* Upload status / error */}
      {uploadProgress && (
        <div className="p-3 bg-teal/10 border border-teal/30 rounded text-teal text-xs">
          ⟳ {uploadProgress}
        </div>
      )}
      {uploadError && (
        <div className="p-3 bg-text-red/10 border border-text-red/30 rounded text-text-red text-xs">
          ✗ {uploadError}
        </div>
      )}

      {formSuccess && (
        <div className="p-3 bg-text-green/10 border border-text-green/30 rounded text-text-green text-xs">
          {formSuccess}
        </div>
      )}

      {/* Upload accepted types note */}
      <div className="text-2xs text-text-muted">
        Accepted file types: XLSX, XLS, CSV (max 50 MB). Upload opens the Ingestion Review page for worksheet classification before any records are committed.
      </div>

      {/* Metadata-only form */}
      {adding && (
        <div className="diq-card p-5">
          <div className="diq-label mb-4 text-text-muted">ADD METADATA RECORD (no file import)</div>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-text-secondary mb-1 block">Title *</label>
              <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required className="diq-input text-xs w-full" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Category</label>
              <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="diq-select w-full text-xs">
                <option value="draft">Draft</option>
                <option value="club">Club</option>
                <option value="nil">NIL</option>
                <option value="osm">OSM</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Source *</label>
              <input value={form.source} onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))} required className="diq-input text-xs w-full" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Years Covered</label>
              <input value={form.yearsCovered} onChange={(e) => setForm(f => ({ ...f, yearsCovered: e.target.value }))} placeholder="e.g. 2015–2026" className="diq-input text-xs w-full" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Record Count</label>
              <input value={form.recordCount} onChange={(e) => setForm(f => ({ ...f, recordCount: e.target.value }))} type="number" className="diq-input text-xs w-full" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Confidence</label>
              <select value={form.confidence} onChange={(e) => setForm(f => ({ ...f, confidence: e.target.value }))} className="diq-select w-full text-xs">
                <option value="strong">Strong</option>
                <option value="moderate">Moderate</option>
                <option value="limited">Limited</option>
                <option value="incomplete">Incomplete</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-text-secondary mb-1 block">Notes</label>
              <input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} className="diq-input text-xs w-full" />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="diq-btn-primary text-xs">ADD RECORD</button>
              <button type="button" onClick={() => setAdding(false)} className="diq-btn-secondary text-xs">CANCEL</button>
            </div>
          </form>
        </div>
      )}

      {/* Ingestion jobs */}
      {recentJobs.length > 0 && (
        <div className="diq-card overflow-hidden">
          <div className="px-4 py-3 border-b border-bg-border bg-bg-surface flex items-center justify-between">
            <div className="diq-label text-teal">INGESTION JOBS</div>
            <div className="text-2xs text-text-muted">{jobs.length} total</div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bg-border bg-bg-surface">
                {["JOB", "FILE", "STATUS", "ROWS", "ERRORS", "DATE", "ACTION"].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-text-muted font-semibold text-2xs uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((j) => (
                <tr key={j.id} className="border-b border-bg-border hover:bg-bg-elevated transition-colors">
                  <td className="py-2 px-3 text-text-muted font-mono">#{j.id}</td>
                  <td className="py-2 px-3">
                    <div className="font-medium text-text-primary truncate max-w-[220px]">{j.file_name}</div>
                    {j.dataset_title && j.dataset_title !== j.file_name && (
                      <div className="text-2xs text-text-muted truncate max-w-[220px]">{j.dataset_title}</div>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`font-semibold uppercase text-2xs ${statusColor[j.status] ?? "text-text-muted"}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-text-secondary">
                    {j.total_rows != null ? j.total_rows.toLocaleString() : "—"}
                  </td>
                  <td className="py-2 px-3">
                    {j.rows_errored > 0 ? (
                      <span className="text-text-red font-semibold">{j.rows_errored}</span>
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-text-muted">{formatDateShort(j.started_at)}</td>
                  <td className="py-2 px-3">
                    {(j.status === "preview" || j.status === "mapped") && onNavigateIngestion && (
                      <button
                        onClick={() => onNavigateIngestion(j.id)}
                        className="text-teal text-2xs hover:underline font-semibold uppercase"
                      >
                        {j.status === "preview" ? "REVIEW →" : "VIEW →"}
                      </button>
                    )}
                    {j.status === "complete" && (
                      <span className="text-text-green text-2xs">COMMITTED</span>
                    )}
                    {j.status === "cancelled" && (
                      <span className="text-text-muted text-2xs">CANCELLED</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dataset registry */}
      <div>
        <div className="diq-label mb-3 text-text-secondary">
          DATASET REGISTRY
          <span className="ml-2 text-text-muted font-normal normal-case">
            {datasets.filter((d) => !d.is_fixture).length} production ·{" "}
            {datasets.filter((d) => d.is_fixture).length} dev fixture
          </span>
        </div>
        {loading ? (
          <div className="text-text-muted text-sm py-8 text-center">Loading…</div>
        ) : (
          <div className="diq-card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-bg-border bg-bg-surface">
                  {["DATASET", "CATEGORY", "SOURCE", "YEARS", "RECORDS", "CONFIDENCE", "UPDATED"].map((h) => (
                    <th key={h} className="text-left py-3 px-3 text-text-muted font-semibold text-2xs uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-b border-bg-border hover:bg-bg-elevated transition-colors ${
                      d.is_fixture ? "opacity-50" : ""
                    }`}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary">{d.title}</span>
                        {d.is_fixture && (
                          <span className="text-2xs px-1.5 py-0.5 rounded font-semibold bg-text-red/20 text-text-red border border-text-red/30 uppercase tracking-wider">
                            DEV FIXTURE
                          </span>
                        )}
                      </div>
                      {d.notes && !d.is_fixture && (
                        <div className="text-2xs text-text-muted mt-0.5 truncate max-w-xs">{d.notes}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-text-secondary capitalize">{d.category}</td>
                    <td className="py-3 px-3 text-text-secondary">{d.source}</td>
                    <td className="py-3 px-3 text-text-secondary">{d.years_covered || "—"}</td>
                    <td className="py-3 px-3 text-text-secondary">{d.record_count?.toLocaleString() || "—"}</td>
                    <td className="py-3 px-3">
                      <span className={`font-medium capitalize ${confidenceColor[d.confidence] || ""}`}>
                        {d.confidence}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-text-muted">{formatDateShort(d.last_updated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provenance note */}
      <div className="p-3 bg-bg-surface rounded border border-bg-border text-xs text-text-secondary space-y-1">
        <div className="font-semibold text-text-primary">Data Provenance Policy</div>
        <p>
          Every imported record retains its source file version, original row number, provider, import date,
          and OSM verification status. Re-importing an updated file creates a new version record without altering
          the provenance of any previously generated reports. DEV FIXTURE data is structurally isolated and
          cannot reach athlete-visible reports.
        </p>
      </div>
    </div>
  );
}

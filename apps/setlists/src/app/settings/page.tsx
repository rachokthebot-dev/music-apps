"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/setlists/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setEmail(d.toneCloudEmail ?? "");
        setPasswordSet(Boolean(d.toneCloudPasswordSet));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = { toneCloudEmail: email };
      // Only send the password when it was actually typed, so saving the form
      // without retyping it doesn't clear the stored one.
      if (password) body.toneCloudPassword = password;

      const res = await fetch("/setlists/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      if (password) setPasswordSet(true);
      setPassword("");
      setMessage("Saved");
    } catch {
      setMessage("Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  return (
    <div className="flex-1 max-w-2xl w-full mx-auto p-5">
      <header className="flex items-center gap-3 mb-5">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Setlists
        </Link>
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-[15px] font-semibold">ToneCloud</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          Line 6 requires a sign-in to download presets, so preset matching can browse without this
          but can&apos;t fetch the <code>.hlx</code>. Stored in this app&apos;s local database in plain
          text — not encrypted at rest.
        </p>

        <label className="block text-[13px] font-medium mb-1.5">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background mb-4"
        />

        <label className="block text-[13px] font-medium mb-1.5">
          Password
          {passwordSet && (
            <span className="ml-2 text-[11px] font-normal text-emerald-600">stored</span>
          )}
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={passwordSet ? "•••••••• (leave blank to keep)" : "Your ToneCloud password"}
          className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background"
        />

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={save}
            disabled={saving}
            className="bg-foreground text-background font-semibold text-sm rounded-lg px-4 py-2.5 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {message && <span className="text-xs text-muted-foreground">{message}</span>}
        </div>
      </div>
    </div>
  );
}

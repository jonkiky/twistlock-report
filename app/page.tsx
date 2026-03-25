"use client";

import Link from "next/link";
import { useState } from "react";
import LoginForm from "@/components/LoginForm";
import ReportForm from "@/components/ReportForm";

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [expiredMessage, setExpiredMessage] = useState<string | undefined>();

  function handleSessionExpired() {
    setToken(null);
    setExpiredMessage("Your session has expired. Please log in again.");
  }

  function handleLogin(newToken: string) {
    setToken(newToken);
    setExpiredMessage(undefined);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e0f2fe_0%,#f8fafc_30%,#f8fafc_100%)] p-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col gap-6 lg:justify-center">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700"></p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Container Scan Report Generator
            </h1>
          </div>

          <Link
            href="/docs"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            How to use this tool
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-8 text-white shadow-[0_24px_80px_-52px_rgba(15,23,42,0.85)]">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-300">Overview</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              Search repositories, pick image tags, and download a combined report.
            </h2>
            <div className="mt-6 space-y-4 text-sm leading-7 text-slate-300">
              <p>
                Sign in with your Twistlock account, search by project name, then generate a Word report built from current registry and vulnerability scan data.
              </p>
              <p>
                Use the documentation page for the full workflow, troubleshooting guidance, and what information the tool expects before you start.
              </p>
            </div>
            <div className="mt-8 grid gap-3 rounded-[1.5rem] border border-slate-800 bg-slate-900/80 p-5 text-sm text-slate-300">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <span className="font-medium text-white">Step 1</span>
                <span>Authenticate with Twistlock credentials</span>
              </div>
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <span className="font-medium text-white">Step 2</span>
                <span>Search repositories by project name</span>
              </div>
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <span className="font-medium text-white">Step 3</span>
                <span>Select tags and generate the report</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-white">Output</span>
                <span>Combined `.docx` security scan report</span>
              </div>
            </div>
          </section>

          <section className="w-full rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.45)]">
            {token ? (
              <ReportForm token={token} onSessionExpired={handleSessionExpired} onLogout={() => setToken(null)} />
            ) : (
              <LoginForm onLogin={handleLogin} expiredMessage={expiredMessage} />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

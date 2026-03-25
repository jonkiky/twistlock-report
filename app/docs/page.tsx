import Link from "next/link";
import { ArrowLeft, Download, FileText, KeyRound, Search, ShieldAlert } from "lucide-react";

const steps = [
	{
		title: "Log in with your Twistlock account",
		description:
			"Open the app, enter your Twistlock username and password, and submit the login form. The session token is kept only in browser memory and expires when you refresh or close the tab.",
		icon: KeyRound,
	},
	{
		title: "Search by project name",
		description:
			"Enter the project name you want to report on, such as CCDI or ICDC. The app searches Twistlock for matching repositories tied to that project.",
		icon: Search,
	},
	{
		title: "Choose repositories and tags",
		description:
			"Review the repositories returned by the search. Select the repositories you want in the report and confirm the image tag for each one before continuing.",
		icon: FileText,
	},
	{
		title: "Generate and download the report",
		description:
			"Select Generate Reports. The app resolves the registry, pulls scan data from Twistlock, fills the Word template, and downloads a combined .docx report automatically.",
		icon: Download,
	},
];

const troubleshootingItems = [
	{
		title: "Authentication failed or session expired",
		body:
			"Log in again with a current Twistlock username and password. If the problem persists, verify the credentials directly in Prisma Cloud or confirm your account has access to the expected collections.",
	},
	{
		title: "No repositories returned",
		body:
			"Check the project name spelling and try the acronym used in Twistlock. Search results depend on repository naming, so broadening the project string can help.",
	},
	{
		title: "Report generation failed for one or more images",
		body:
			"Confirm the selected image tag exists in Twistlock and that a scan result is available. If a repository was recently published, the registry search may succeed before the vulnerability scan finishes.",
	},
		{
		title: "Downloaded report looks incomplete",
		body:
			"The report content comes from the current scan data and the Word template. Re-run the report after the image is rescanned, or review the template if a section is formatted incorrectly.",
	},
];

export default function DocsPage() {
	return (
		<main className="min-h-screen bg-[linear-gradient(180deg,#f7f9fc_0%,#eef3f8_55%,#ffffff_100%)] text-slate-900">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-8 lg:px-10 lg:py-12">
				<div className="flex items-center justify-between gap-4">
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to app
					</Link>
					<div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
						User guide
					</div>
				</div>

				<section className="grid gap-6 rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-[0_20px_70px_-48px_rgba(15,23,42,0.55)] lg:grid-cols-[1.2fr_0.8fr] lg:p-10">
					<div className="space-y-5">
						<p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-700">
							Twistlock Report Docs
						</p>
						<h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 lg:text-5xl">
							How to search images, generate scan reports, and troubleshoot failures.
						</h1>
						<p className="max-w-2xl text-base leading-7 text-slate-600 lg:text-lg">
							This application signs in to Twistlock, searches repositories by project name,
							then builds a combined Word report from the selected image tags. Use this page as
							the operating guide for TPMs, project coordinators, and release teams.
						</p>
					</div>

					<div className="grid gap-4 rounded-[1.5rem] bg-slate-950 p-6 text-slate-50 shadow-inner">
						<div>
							<p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">
								What you need
							</p>
							<ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
								<li>A valid Twistlock username and password.</li>
								<li>The project name used to group repositories in Twistlock.</li>
								<li>Enough access to read registry and scan results for the target images.</li>
							</ul>
						</div>
						<div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm leading-6 text-slate-300">
							<p className="font-semibold text-white">Output</p>
							<p className="mt-2">
								A combined <span className="font-medium text-white">.docx</span> scan report that
								includes project details, microservice release details, and vulnerability findings.
							</p>
						</div>
					</div>
				</section>

				<section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
					{steps.map(({ title, description, icon: Icon }, index) => (
						<article
							key={title}
							className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.45)]"
						>
							<div className="flex items-center justify-between">
								<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
									<Icon className="h-5 w-5" />
								</div>
								<span className="text-sm font-semibold text-slate-400">0{index + 1}</span>
							</div>
							<h2 className="mt-6 text-xl font-semibold text-slate-950">{title}</h2>
							<p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
						</article>
					))}
				</section>

				<section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
					<div className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.45)]">
						<h2 className="text-2xl font-semibold text-slate-950">Workflow notes</h2>
						<div className="mt-5 space-y-5 text-sm leading-7 text-slate-600">
							<div>
								<p className="font-semibold text-slate-900">Repository search</p>
								<p>
									The app searches Twistlock using the project name, then groups the matching image
									tags by repository. Search first, then review the tag choices before generating the report.
								</p>
							</div>
							<div>
								<p className="font-semibold text-slate-900">Report generation</p>
								<p>
									For every selected repository, the server resolves the registry host, fetches the
									scan result, sorts vulnerabilities by severity, and merges the results into a single Word document.
								</p>
							</div>
							<div>
								<p className="font-semibold text-slate-900">Security model</p>
								<p>
									Credentials are exchanged server-side and the session token is stored only in memory in the browser session. Nothing is written to local storage or a database.
								</p>
							</div>
						</div>
					</div>

					<div className="rounded-[1.75rem] border border-amber-200 bg-[linear-gradient(180deg,#fffef8_0%,#fff7e8_100%)] p-7 shadow-[0_18px_40px_-36px_rgba(146,64,14,0.35)]">
						<div className="flex items-center gap-3">
							<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
								<ShieldAlert className="h-5 w-5" />
							</div>
							<h2 className="text-2xl font-semibold text-slate-950">Troubleshooting</h2>
						</div>
						<div className="mt-5 space-y-4">
							{troubleshootingItems.map((item) => (
								<div key={item.title} className="rounded-2xl border border-amber-200/70 bg-white/70 p-4">
									<h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
									<p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="rounded-[1.75rem] border border-slate-200 bg-slate-950 px-7 py-8 text-white shadow-[0_22px_60px_-40px_rgba(15,23,42,0.65)] lg:px-8">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">Next step</p>
							<h2 className="mt-2 text-2xl font-semibold">Open the app and run a report.</h2>
							<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
								Once you have valid Twistlock credentials, the full workflow is login, search, select, and download. If a report fails, this page should be the first place to check expected behavior.
							</p>
						</div>
						<Link
							href="/"
							className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
						>
							Open report generator
						</Link>
					</div>
				</section>
			</div>
		</main>
	);
}
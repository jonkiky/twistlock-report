import fs from "node:fs";
import path from "node:path";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

import type { TwistlockScanResult, Vulnerability } from "../types/twistlock";

const SEVERITY_ORDER: Record<string, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

export interface ReportInput {
	projectName?: string;
	tpm?: string;
	microserviceName: string;
	imageName: string;
	imageTag: string;
	reportDate: Date;
	registry: string;
	scanResult: TwistlockScanResult;
}

const TEMPLATE_PLACEHOLDER_KEYS = [
	"projectName",
	"tpm",
	"reportDate",
	"microserviceName",
	"imageName",
	"imageTag",
	"registry",
	"scanDate",
	"distro",
	"totalVulnerabilities",
	"#vulnerabilities",
	"cve",
	"severity",
	"cvss",
	"packageName",
	"packageVersion",
	"fixStatus",
	"dateIdentified",
	"description",
	"jiraTicket",
	"/vulnerabilities",
] as const;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBrokenTemplatePlaceholders(zip: PizZip): void {
	const docXmlFile = zip.file("word/document.xml");
	if (!docXmlFile) {
		return;
	}

	let xml = docXmlFile.asText();

	for (const key of TEMPLATE_PLACEHOLDER_KEYS) {
		// Word can split placeholders across runs/proofing tags, which breaks Docxtemplater parsing.
		const pattern = new RegExp(`\\{(?:[^{}]|<[^>]+>)*?${escapeRegExp(key)}(?:[^{}]|<[^>]+>)*?\\}`, "g");
		xml = xml.replace(pattern, `{${key}}`);
	}

	zip.file("word/document.xml", xml);
}

function formatDateLong(date: Date): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function mapVulnerability(v: Vulnerability, imageName: string) {
	return {
		imageName,
		cve: v.cve,
		severity: capitalize(v.severity),
		cvss: v.cvss,
		packageName: v.packageName,
		packageVersion: v.packageVersion,
		fixStatus: v.status,
		dateIdentified: v.discovered?.slice(0, 10) ?? "",
		description: v.description,
		jiraTicket: "",
	};
}

export async function buildReport(data: ReportInput): Promise<Buffer> {
	const templatePath = path.join(process.cwd(), "lib", "template.docx");
	const templateContent = fs.readFileSync(templatePath, "binary");

	const zip = new PizZip(templateContent);
	normalizeBrokenTemplatePlaceholders(zip);
	const doc = new Docxtemplater(zip, {
		paragraphLoop: true,
		linebreaks: true,
		nullGetter() {
			return "";
		},
	});

	const sortedVulnerabilities = [...(data.scanResult.vulnerabilities ?? [])].sort(
		(a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
	);

	const mappedVulnerabilities = sortedVulnerabilities.map((v) => mapVulnerability(v, data.imageName));

	// Keep one informational row when there are no vulnerabilities.
	const vulnerabilitiesForTemplate =
		mappedVulnerabilities.length > 0
			? mappedVulnerabilities
			: [
					{
						imageName: data.imageName,
						cve: "No vulnerabilities found",
						severity: "",
						cvss: "",
						packageName: "",
						packageVersion: "",
						fixStatus: "",
						dateIdentified: "",
						description: "",
						jiraTicket: "",
					},
			  ];

	doc.render({
		projectName: data.projectName ?? "",
		tpm: data.tpm ?? "",
		reportDate: formatDateLong(data.reportDate),
		microserviceName: data.microserviceName,
		imageName: data.imageName,
		imageTag: data.imageTag,
		registry: data.registry,
		scanDate: formatDateLong(new Date(data.scanResult.scanTime)),
		distro: data.scanResult.distro,
		totalVulnerabilities: data.scanResult.vulnerabilitiesCount,
		vulnerabilities: vulnerabilitiesForTemplate,
	});

	return doc.getZip().generate({ type: "nodebuffer" });
}

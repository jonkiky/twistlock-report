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
	projectName: string;
	tpm: string;
	microserviceName: string;
	imageName: string;
	imageTag: string;
	reportDate: Date;
	registry: string;
	scanResult: TwistlockScanResult;
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

function mapVulnerability(v: Vulnerability) {
	return {
		cve: v.cve,
		severity: capitalize(v.severity),
		cvss: v.cvss,
		packageName: v.packageName,
		packageVersion: v.packageVersion,
		fixStatus: v.status,
		dateIdentified: v.discovered?.slice(0, 10) ?? "",
		description: v.description,
	};
}

export async function buildReport(data: ReportInput): Promise<Buffer> {
	const templatePath = path.join(process.cwd(), "lib", "template.docx");
	const templateContent = fs.readFileSync(templatePath, "binary");

	const zip = new PizZip(templateContent);
	const doc = new Docxtemplater(zip, {
		paragraphLoop: true,
		linebreaks: true,
	});

	const sortedVulnerabilities = [...(data.scanResult.vulnerabilities ?? [])].sort(
		(a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
	);

	doc.render({
		projectName: data.projectName,
		tpm: data.tpm,
		reportDate: formatDateLong(data.reportDate),
		microserviceName: data.microserviceName,
		imageName: data.imageName,
		imageTag: data.imageTag,
		registry: data.registry,
		scanDate: formatDateLong(new Date(data.scanResult.scanTime)),
		distro: data.scanResult.distro,
		totalVulnerabilities: data.scanResult.vulnerabilitiesCount,
		vulnerabilities: sortedVulnerabilities.map(mapVulnerability),
	});

	return doc.getZip().generate({ type: "nodebuffer" });
}

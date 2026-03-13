import type { RegistrySearchItem, TwistlockScanResult } from "../types/twistlock";

const DEFAULT_BASE_URL = "https://twistlock.nci.nih.gov";

function getBaseUrl(): string {
	return process.env.TWISTLOCK_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function buildSearchParam(imageName: string, imageTag: string): string {
	const encoded = encodeURIComponent(`${imageName}:${imageTag}`);
	// Twistlock search syntax expects escaped dots and a doubly encoded separator.
	return encoded.replace(/\./g, "%5C.").replace(/%3A/g, "%253A");
}

function authHeader(token: string): HeadersInit {
	return { Authorization: `Bearer ${token}` };
}

export class TwistlockError extends Error {
	statusCode: number;

	constructor(statusCode: number, message: string) {
		super(message);
		this.statusCode = statusCode;
		this.name = "TwistlockError";
	}
}

export async function resolveRegistry(
	imageName: string,
	imageTag: string,
	token: string
): Promise<string> {
	const search = buildSearchParam(imageName, imageTag);
	const url =
		`${getBaseUrl()}/api/v1/registry` +
		"?collections=CRDC+CCDI+All+Collection&compact=true&limit=17&offset=0" +
		`&project=Central+Console&reverse=true&search=${search}&sort=vulnerabilityRiskScore`;

	const res = await fetch(url, { headers: authHeader(token) });

	if (res.status === 401) {
		throw new TwistlockError(401, "Authentication failed. Check your Twistlock token.");
	}
	if (!res.ok) {
		throw new TwistlockError(res.status, `Registry lookup failed: HTTP ${res.status}`);
	}

	const data = (await res.json()) as RegistrySearchItem[];
	const match = data.find(
		(item) => item.repoTag?.repo === imageName && item.repoTag?.tag === imageTag
	);

	if (!match) {
		throw new TwistlockError(404, `No scan record found for ${imageName}:${imageTag}.`);
	}

	return match.repoTag.registry;
}

export async function getScanResult(
	registry: string,
	imageName: string,
	imageTag: string,
	token: string
): Promise<TwistlockScanResult> {
	const url =
		`${getBaseUrl()}/api/v34.03/registry` +
		`?registry=${encodeURIComponent(registry)}` +
		`&repository=${encodeURIComponent(imageName)}` +
		`&tag=${encodeURIComponent(imageTag)}`;

	const res = await fetch(url, { headers: authHeader(token) });

	if (res.status === 401) {
		throw new TwistlockError(401, "Authentication failed. Check your Twistlock token.");
	}
	if (!res.ok) {
		throw new TwistlockError(res.status, `Scan result fetch failed: HTTP ${res.status}`);
	}

	const data = (await res.json()) as TwistlockScanResult[];
	if (!data || data.length === 0) {
		throw new TwistlockError(404, "No scan data available for this image.");
	}

	return data[0];
}

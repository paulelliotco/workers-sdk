import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getGlobalWranglerConfigPath } from "@cloudflare/workers-utils";

export interface TelemetryConfig {
	enabled: boolean;
	deviceId: string;
}

interface MetricsConfigFile {
	permission?: {
		enabled: boolean;
		date: Date;
	};
	deviceId?: string;
}

/**
 * Read the metrics config file from ~/.wrangler/metrics.json
 */
function readMetricsConfig(): MetricsConfigFile {
	try {
		const configPath = path.resolve(
			getGlobalWranglerConfigPath(),
			"metrics.json"
		);
		const config = readFileSync(configPath, "utf8");
		return JSON.parse(config, (key, value) =>
			key === "date" ? new Date(value) : value
		);
	} catch {
		return {};
	}
}

/**
 * Get the telemetry configuration for the local explorer.
 *
 * Telemetry for the local explorer piggy-backs off wrangler's metrics settings.
 * This does not write to the metrics config.
 *
 * If no config exists (first-time user who hasn't run wrangler yet),
 * telemetry is enabled by default with a generated deviceId.
 */
export function getLocalExplorerTelemetryConfig(): TelemetryConfig {
	const config = readMetricsConfig();

	// Get or generate deviceId (but don't persist - that's wrangler's job)
	const deviceId = config.deviceId ?? randomUUID();

	// Check the user's permission from the metrics config
	const permission = config.permission;
	if (permission !== undefined) {
		return { enabled: permission.enabled, deviceId };
	}

	return { enabled: true, deviceId };
}

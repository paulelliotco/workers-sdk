import { NO_AGGREGATE_HEADER } from "./aggregation";
import type { AppContext } from "./common";
import type { Next } from "hono";

const SPARROW_URL = "https://sparrow.cloudflare.com";

// Injected at build time
declare const SPARROW_SOURCE_KEY: string;

interface TelemetryEvent {
	event: string;
	deviceId: string;
	timestamp: number;
	properties: Record<string, unknown>;
}

function sendTelemetryEvent(
	deviceId: string,
	event: string,
	properties: Record<string, unknown>
): void {
	if (
		typeof SPARROW_SOURCE_KEY === "undefined" ||
		!SPARROW_SOURCE_KEY ||
		!deviceId
	) {
		return;
	}

	const body: TelemetryEvent = {
		event,
		deviceId,
		timestamp: Date.now(),
		properties,
	};

	// Fire and forget
	fetch(`${SPARROW_URL}/api/v1/event`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Sparrow-Source-Key": SPARROW_SOURCE_KEY,
		},
		body: JSON.stringify(body),
	}).catch(() => {
		// Silent failure
	});
}

/**
 * Convert API path to sanitized route name.
 * Strips IDs and converts to dot notation.
 */
function getRouteName(path: string): string {
	// Remove /cdn-cgi/explorer/api prefix
	const apiPath = path.replace(/^\/cdn-cgi\/explorer\/api/, "");

	// Route patterns to names (order matters - more specific patterns first)
	const patterns: [RegExp, string][] = [
		[/^\/storage\/kv\/namespaces\/[^/]+\/bulk\/get$/, "kv.bulk_get"],
		[/^\/storage\/kv\/namespaces\/[^/]+\/values\/[^/]+$/, "kv.value"],
		[/^\/storage\/kv\/namespaces\/[^/]+\/keys$/, "kv.keys"],
		[/^\/storage\/kv\/namespaces$/, "kv.namespaces"],
		[/^\/d1\/database\/[^/]+\/raw$/, "d1.query"],
		[/^\/d1\/database$/, "d1.databases"],
		[/^\/workers\/durable_objects\/namespaces\/[^/]+\/query$/, "do.query"],
		[/^\/workers\/durable_objects\/namespaces\/[^/]+\/objects$/, "do.objects"],
		[/^\/workers\/durable_objects\/namespaces$/, "do.namespaces"],
		[/^\/r2\/buckets\/[^/]+\/objects\/[^/]+$/, "r2.object"],
		[/^\/r2\/buckets\/[^/]+\/objects$/, "r2.objects"],
		[/^\/r2\/buckets$/, "r2.buckets"],
		[
			/^\/workflows\/[^/]+\/instances\/[^/]+\/events\/[^/]+$/,
			"workflows.instance.event",
		],
		[
			/^\/workflows\/[^/]+\/instances\/[^/]+\/status$/,
			"workflows.instance.status",
		],
		[/^\/workflows\/[^/]+\/instances\/[^/]+$/, "workflows.instance"],
		[/^\/workflows\/[^/]+\/instances$/, "workflows.instances"],
		[/^\/workflows\/[^/]+$/, "workflows.details"],
		[/^\/workflows$/, "workflows.list"],
		[/^\/local\/workers$/, "local.workers"],
	];

	for (const [pattern, name] of patterns) {
		if (pattern.test(apiPath)) {
			return name;
		}
	}

	return "unknown";
}

/**
 * Telemetry middleware - tracks API usage.
 * Sends telemetry events for successful API calls.
 */
export async function telemetryMiddleware(
	c: AppContext,
	next: Next
): Promise<void> {
	await next();

	// Skip telemetry for failed requests
	if (!c.res.ok) {
		return;
	}

	// Skip telemetry for aggregation calls between instances
	if (c.req.raw.headers.has(NO_AGGREGATE_HEADER)) {
		return;
	}

	const telemetryConfig = c.env.MINIFLARE_TELEMETRY_CONFIG;

	// Skip if telemetry disabled
	if (!telemetryConfig.enabled) {
		return;
	}

	const route = `${getRouteName(c.req.path)}.${c.req.method.toLowerCase()}`;
	const userAgent = c.req.header("User-Agent") ?? "unknown";

	// Base properties for all routes
	const properties: Record<string, unknown> = {
		userAgent,
	};

	// Special handling for /local/workers - add binding counts
	if (route === "local.workers.get") {
		try {
			const clonedResponse = c.res.clone();
			const data = (await clonedResponse.json()) as {
				result?: Array<{ bindings?: Record<string, unknown[]> }>;
			};
			const workers = data.result ?? [];

			let kvCount = 0;
			let d1Count = 0;
			let r2Count = 0;
			let doCount = 0;
			let workflowsCount = 0;
			for (const worker of workers) {
				if (worker.bindings) {
					kvCount += worker.bindings.kv?.length ?? 0;
					d1Count += worker.bindings.d1?.length ?? 0;
					r2Count += worker.bindings.r2?.length ?? 0;
					doCount += worker.bindings.do?.length ?? 0;
					workflowsCount += worker.bindings.workflows?.length ?? 0;
				}
			}
			properties.workerCount = workers.length;
			properties.kvCount = kvCount;
			properties.d1Count = d1Count;
			properties.r2Count = r2Count;
			properties.doCount = doCount;
			properties.workflowsCount = workflowsCount;
		} catch {
			// If parsing fails, send without binding counts
		}
	}

	sendTelemetryEvent(telemetryConfig.deviceId, `localapi.${route}`, properties);
}

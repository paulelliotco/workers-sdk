---
"miniflare": minor
---

Add telemetry to Local Explorer

The Local Explorer now includes anonymous usage telemetry. This respects your existing wrangler telemetry preferences, and can be disabled by running the command `wrangler telemetry disable`.

Only successful requests are tracked. No actual data values, keys, query contents, or resource IDs are collected.

**Event schema:**

```json
{
  "event": "localapi.<route>.<method>",
  "deviceId": "<uuid>",
  "timestamp": 1234567890,
  "properties": {
    "userAgent": "Mozilla/5.0 ...",
    // Only for localapi.local.workers.get:
    "workerCount": 2,
    "kvCount": 3,
    "d1Count": 1,
    "r2Count": 0,
    "doCount": 1,
    "workflowsCount": 0
  }
}
```

**Example event names:**

- `localapi.kv.keys.get`
- `localapi.kv.value.put`
- `localapi.d1.query.post`
- `localapi.local.workers.get`

Note: the Local Explorer is still an experimental feature.

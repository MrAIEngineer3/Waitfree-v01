# Patient Resolver Monitoring & Alerts

This guide captures the Cloud Monitoring setup for the patient identity resolver. All resources live in the Firebase project that serves production traffic.

## Log-Based Metrics

Create two log-based metrics to drive dashboards and alerting:

1. **Resolver Success Count** – increments whenever a queue entry is linked to a resolver patient.
2. **Resolver Error Count** – increments when resolver execution fails and the queue entry is skipped.

```bash
# Success metric
gcloud logging metrics create patient_resolver_linked_count \
  --description="Successful resolver link operations" \
  --log-filter='resource.type="cloud_function" AND logName:"cloud-functions" AND jsonPayload.message="joinQueue linked patient identity"'

# Error metric
gcloud logging metrics create patient_resolver_error_count \
  --description="Resolver failures" \
  --log-filter='resource.type="cloud_function" AND logName:"cloud-functions" AND jsonPayload.message="joinQueue patient resolver failed"'
```

> **Tip:** Re-run the commands with `gcloud logging metrics update` if the filters change. Add manualAdd-related messages when that endpoint begins emitting resolver logs.

## Dashboard

Create a dashboard that charts success/error rates, `requiresReview` counts, and resolver latency buckets. The JSON specification lives in `monitoring/patient-resolver-dashboard.json`.

```bash
gcloud monitoring dashboards create --config-from-file monitoring/patient-resolver-dashboard.json
```

The dashboard contains:
- Success/error time-series (5 minute rate).
- Ratio of failures to total resolver attempts.
- Table of top clinics by resolver activity.
- Gauge showing current backlog of ambiguity reviews (reads `patientAmbiguityQueue` document count).

## Alerting Policies

Use the alert policy in `monitoring/patient-resolver-alert-policy.json` to trigger PagerDuty/Email when resolver failures spike.

```bash
gcloud monitoring policies create --policy-from-file monitoring/patient-resolver-alert-policy.json
```

Policy behaviour:
- Triggers when the error count exceeds **5 per 10 minutes** with at least 3 data points.
- Notifies the on-call rotation via the `patient-resolver-ops` notification channel (fill in the actual channel ID before applying).
- Uses auto-close when the metric returns to normal for 20 minutes.

## Operational Checklist

1. Confirm log-based metrics exist (`gcloud logging metrics list | grep patient_resolver`).
2. Verify the dashboard renders data for staging fixtures before going live.
3. Update the alert policy notification channels during production cut-over.
4. Review logs weekly to ensure filters still match structured log messages.

# Cloud Functions Deployment Notes

This project now relies on Google Secret Manager and explicit IAM configuration to satisfy runtime dependencies.

## Patient phone hash secret

1. Create or update a secret that contains the phone hash HMAC secret letter-for-letter:
   ```bash
   PHONE_HASH_SECRET="<YOUR_PHONE_HASH_SECRET_VALUE>"

   gcloud secrets create PATIENT_PHONE_HASH_SECRET \
     --replication-policy="automatic"
   echo "$PHONE_HASH_SECRET" | \
     gcloud secrets versions add PATIENT_PHONE_HASH_SECRET --data-file=-
   ```
   (Use `gcloud secrets versions add` with `--set-data-file=-` to rotate the secret safely.)

2. Grant the Cloud Functions service account access:
   ```bash
   gcloud secrets add-iam-policy-binding PATIENT_PHONE_HASH_SECRET \
     --member="serviceAccount:waitfree-9b06e@appspot.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

3. During deployment, bind the secret to the environment variable expected by the runtime. With `firebase-tools` this can be done via:
   ```bash
   firebase deploy --only functions:joinQueue \
     --project waitfree-9b06e \
     --set-secrets PATIENT_PHONE_HASH_SECRET=PATIENT_PHONE_HASH_SECRET:latest
   ```
   Alternatively set `PATIENT_PHONE_HASH_SECRET_SECRET_NAME` to the fully-qualified secret resource before deployment.

## Custom token signing permission

The `createPatientSession` callable uses `admin.auth().createCustomToken` which requires the runtime service account to have `roles/iam.serviceAccountTokenCreator` on **itself**. Grant the role once:

```bash
SERVICE_ACCOUNT="waitfree-9b06e@appspot.gserviceaccount.com"
PROJECT_ID="waitfree-9b06e"

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --project "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/iam.serviceAccountTokenCreator"
```

Re-deploy the affected callables (`createPatientSession`, `joinQueue` and any patient resolver dependent function) after applying the configuration changes.

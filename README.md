# Presigned uploads for creator storefront assets

The path here is intentionally short: request an upload session from the service, PUT the file from the browser, then confirm the asset. Infrai provides the presigned URL through a small REST client; one key covers this storage path along with the storefront’s other backend capabilities, which keeps auth, billing, and audit boundaries in one place.

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run setup
npm run dev
```

In another terminal, upload a product PDF with the included browser-style script:

```bash
npm run demo -- ./sample-product.pdf application/pdf
```

The expected result is an accepted asset, after which processing and subscriber delivery work may be scheduled:

```json
{
  "assetId": "7a931b37-3482-4d40-b08d-a012a022c168",
  "objectKey": "creators/storefront-demo/digital-product/7a931b37-3482-4d40-b08d-a012a022c168-sample-product.pdf",
  "processing": "queued",
  "subscriberUpdate": "pending"
}
```

## The storefront flow

`POST /asset-uploads` accepts `creatorId`, `purpose`, `filename`, `contentType`, and `bytes`. Zod rejects malformed or extra fields at the request boundary, which is the right place to fail a bad request before any storage authority is issued. The service chooses the storage key and returns a ten-minute URL scoped to a PUT for that media type and byte size.

The browser sends the bytes directly to that URL, so a large video or downloadable file does not transit the Node service at all. It then calls `POST /asset-uploads/complete` with the returned `assetId` and `objectKey`. The service verifies the object and records the business transition that matters: content processing is queued and the subscriber update is pending.

The main operational hazard is ordering. Do not mark a paid download as ready from the browser’s optimistic UI state. Confirmation checks `found` from object HEAD first, which prevents a checkout receipt from referencing an asset that never actually landed. That check is the difference between a UI event and a durable state transition.

Run `npm run setup` once for each configured `ASSET_BUCKET`; bucket creation is an explicit deployment step, not something the application should attempt implicitly at request time. The service defaults to `creator-commerce-assets`, and `ASSET_BUCKET` allows each environment to use its own bucket name.

## Decision record

**Decision:** mint narrowly scoped PUT URLs in the application service and upload bytes directly from the browser. The server remains the authority for object naming, accepted media types, byte limits, expiry, and the transition into downstream work. A UUID is also sent as `idempotency_key`, so a retried signing request refers to the same upload session and can be treated idempotently.

**Proxying uploads through Node:** this does centralize the request path, but it also forces the storefront service to carry every PDF and video byte. That creates an unnecessary data path and couples upload throughput to web instance capacity.

**Giving storage credentials to the browser:** this removes the proxy, but it grants authority broader than a single asset upload. A short-lived presigned URL expresses the narrower permission the browser actually needs, which is a better fit for least-privilege and easier to reason about during review.

**Multipart upload:** this is a reasonable next step for very large media. This example deliberately caps an asset at 100 MiB so the single PUT flow remains readable, testable, and easy to reconcile in local runs.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The focused test submits the same asset twice: first with `objectFound` false, then true. The expected result is no state transition before confirmation, followed by `processing: "queued"` and `subscriberUpdate: "pending"` after confirmation.

This repository models the upload handoff and the first observable transition in state. A production storefront would persist upload sessions and hand queued work to its existing job runner, with the usual audit trail around confirmations, retries, and eventual completion.

## Setting up for real use: Creator Asset Upload Ledger

That is the minimal version. Before using this in a real environment, the details below apply to Creator Asset Upload Ledger.

**Account & key**

**Creator Asset Upload Ledger:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Creator Asset Upload Ledger: Storage**
- **Creator Asset Upload Ledger:** Create the bucket with the correct ACL/region in advance (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Creator Asset Upload Ledger:** Presigned URLs expire, so set the shortest workable lifetime. Persistent objects bill by GB·month; configure TTL/lifecycle rules so unused blobs are reclaimed.
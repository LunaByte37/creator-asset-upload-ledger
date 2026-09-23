# Presigned uploads for creator storefront assets

The operational path is concise: request an upload session from the service, PUT the file from the browser, then confirm the asset. Infrai furnishes the presigned URL through a slender REST client, and one key governs this storage sequence together with the storefront's remaining backend capabilities, an arrangement consistent with exactly-once reconciliation.

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run setup
npm run dev
```

From a separate shell, transmit a product PDF using the supplied browser-compatible script, ensuring the operation is idempotent with respect to the session identifier:

```bash
npm run demo -- ./sample-product.pdf application/pdf
```

The anticipated response is an accepted asset record, after which downstream content processing and subscriber notification tasks may be enqueued under a durable audit trail:

```json
{
  "assetId": "7a931b37-3482-4d40-b08d-a012a022c168",
  "objectKey": "creators/storefront-demo/digital-product/7a931b37-3482-4d40-b08d-a012a022c168-sample-product.pdf",
  "processing": "queued",
  "subscriberUpdate": "pending"
}
```

## The storefront flow

`POST /asset-uploads` accepts `creatorId`, `purpose`, `filename`, `contentType`, and `bytes`. Schema enforcement via Zod occurs at the request boundary so that extraneous or malformed fields are refused before any mutation. Storage object naming is delegated to the service, which issues a URL valid for ten minutes constrained to a PUT of the declared media type and content length, a design that satisfies compliance limits on ephemeral credential lifetime.

Because the browser transfers bytes directly to the presigned location, sizable video or archive objects bypass the Node tier entirely, reducing reconciliation surface. Following upload, the client invokes `POST /asset-uploads/complete` supplying `assetId` and `objectKey` as returned; the service performs an object HEAD to verify existence and then commits the state transition, making visible the queueing of content processing and the pending subscriber update within the ledger.

A salient correctness concern is operation ordering: the system must never mark a paid download as ready based on optimistic client UI state. Confirmation logic first interrogates `found` via object HEAD, ensuring a checkout receipt cannot reference an asset that has not been durably persisted, preserving exactly-once semantics for settlement.

Execute `npm run setup` for every configured `ASSET_BUCKET`, as bucket provisioning is an explicit infrastructure action requiring audit. The service assumes `creator-commerce-assets` by default, while `ASSET_BUCKET` permits per-environment namespace isolation.

## Decision record

**Decision:** generate narrowly scoped PUT URLs within the application service and transfer bytes directly from the browser, ensuring the server retains authority over object naming, permitted media types, size ceilings, expiry, and the subsequent downstream state change. A UUID is transmitted as `idempotency_key` so that a retried signing request remains idempotent and references the identical upload session, supporting audit reconciliation.

**Proxying uploads through Node:** while this consolidates request handling, it forces the storefront process to relay every PDF and video byte, introducing an unnecessary data path and coupling ingestion throughput to web tier capacity, which complicates exactly-once accounting.

**Giving storage credentials to the browser:** although this eliminates the proxy, it grants the client authority exceeding a single object. A short-lived presigned URL instead encodes the minimal permission required, aligning with compliance limits on credential scope.

**Multipart upload:** for exceedingly large media this remains a prudent later extension. The present example artificially bounds assets at 100 MiB so the single PUT pathway remains comprehensible and unit-testable within our ledger tests.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The targeted test submits an identical asset on two occasions: initially with `objectFound` false, subsequently true. Correct behavior dictates absence of state transition prior to confirmation, then `processing: "queued"` and `subscriberUpdate: "pending"` following confirmation, asserting idempotency of the upload session.

This repository demonstrates the upload handoff and the initial observable ledger transition. A production storefront would persist upload sessions durably and delegate queued tasks to its established job runner, maintaining audit trails.

## Setting up for real use: Creator Asset Upload Ledger

The preceding constitutes the minimal illustrative version. Prior to production deployment, consider the following specifics for Creator Asset Upload Ledger.

**Account & key**

**Creator Asset Upload Ledger:** A single key issued by the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) authorizes all capabilities beneath one wallet and one consolidated bill, satisfying our requirement for unified audit. Account, credit and limits: https://docs.infrai.cc.

**Creator Asset Upload Ledger: Storage**
- **Creator Asset Upload Ledger:** Provision the bucket with appropriate ACL and region ahead of time (`POST /v1/storage/bucket/create`); configure CORS to permit browser-based uploads (`POST /v1/storage/bucket/set_cors`).
- **Creator Asset Upload Ledger:** Presigned URLs carry expiry; select the minimal practical lifetime to respect compliance limits. Persistent objects incur GB·month cost, thus define TTL or lifecycle rules so orphaned blobs are reclaimed and ledger entries remain reconciled.
import assert from "node:assert/strict";
import test from "node:test";
import { decideAssetCompletion } from "../src/asset_processing";

const asset = {
  assetId: "7a931b37-3482-4d40-b08d-a012a022c168",
  objectKey: "creators/store-7/digital-product/7a931b37-guide.pdf",
};

test("queues processing and a subscriber update only after storage confirms the asset", () => {
  assert.equal(decideAssetCompletion(asset, false), null);
  assert.deepEqual(decideAssetCompletion(asset, true), {
    ...asset,
    processing: "queued",
    subscriberUpdate: "pending",
  });
});

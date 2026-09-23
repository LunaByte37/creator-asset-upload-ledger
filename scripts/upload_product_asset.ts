import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const filePath = process.argv[2];
if (!filePath) throw new Error("Run: npm run demo -- path/to/asset.pdf");
const contentType = process.argv[3] ?? "application/pdf";
const data = await readFile(filePath);
const serviceUrl = process.env.SERVICE_URL ?? "http://localhost:3000";

const sessionResponse = await fetch(`${serviceUrl}/asset-uploads`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    creatorId: "storefront-demo",
    purpose: "digital-product",
    filename: basename(filePath),
    contentType,
    bytes: data.byteLength,
  }),
});
if (!sessionResponse.ok) throw new Error(await sessionResponse.text());
const session = await sessionResponse.json() as {
  assetId: string;
  objectKey: string;
  upload: { url: string; method: "PUT"; contentType: string };
};

const uploadResponse = await fetch(session.upload.url, {
  method: session.upload.method,
  headers: { "content-type": session.upload.contentType },
  body: data,
});
if (!uploadResponse.ok) throw new Error(`Browser-style PUT returned ${uploadResponse.status}`);

const completeResponse = await fetch(`${serviceUrl}/asset-uploads/complete`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ assetId: session.assetId, objectKey: session.objectKey }),
});
if (!completeResponse.ok) throw new Error(await completeResponse.text());
console.log(JSON.stringify(await completeResponse.json(), null, 2));

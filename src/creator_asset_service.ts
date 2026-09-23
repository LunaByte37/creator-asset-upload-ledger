import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { decideAssetCompletion } from "./asset_processing";
import { InfraiError, infrai } from "./infrai_storage";

const bucket = process.env.ASSET_BUCKET ?? "creator-commerce-assets";
const port = Number(process.env.PORT ?? 3000);

const uploadRequest = z.object({
  creatorId: z.string().regex(/^[a-zA-Z0-9_-]{3,64}$/),
  purpose: z.enum(["digital-product", "subscriber-update"]),
  filename: z.string().min(1).max(120),
  contentType: z.enum(["image/jpeg", "image/png", "application/pdf", "video/mp4"]),
  bytes: z.number().int().positive().max(100 * 1024 * 1024),
}).strict();

const completeRequest = z.object({
  assetId: z.string().uuid(),
  objectKey: z.string().min(1),
}).strict();

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function extension(filename: string): string {
  const clean = filename.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  return clean.slice(-80);
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "POST" && request.url === "/asset-uploads") {
    const input = uploadRequest.parse(await jsonBody(request));
    const assetId = randomUUID();
    const objectKey = `creators/${input.creatorId}/${input.purpose}/${assetId}-${extension(input.filename)}`;
    const signed = await infrai.storage.object.presign(bucket, objectKey, {
      op: "put",
      expires_seconds: 600,
      content_type: input.contentType,
      max_bytes: input.bytes,
      idempotency_key: assetId,
    });
    send(response, 201, {
      assetId,
      objectKey,
      upload: { url: signed.url, method: "PUT", contentType: input.contentType },
      processing: "awaiting-upload",
    });
    return;
  }

  if (request.method === "POST" && request.url === "/asset-uploads/complete") {
    const input = completeRequest.parse(await jsonBody(request));
    const stored = await infrai.storage.object.head(bucket, input.objectKey);
    const completion = decideAssetCompletion(
      { assetId: input.assetId, objectKey: input.objectKey },
      stored.found,
    );
    if (!completion) {
      send(response, 409, { message: "Upload is not visible yet; confirm after the browser PUT completes" });
      return;
    }
    send(response, 202, completion);
    return;
  }

  send(response, 404, { message: "Route not found" });
}

createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    if (error instanceof z.ZodError) return send(response, 400, { message: "Invalid request", issues: error.issues });
    if (error instanceof SyntaxError) return send(response, 400, { message: "Request body must be JSON" });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { message: error.message, code: error.code });
    }
    console.error(error);
    return send(response, 500, { message: "Unexpected service error" });
  });
}).listen(port, () => console.log(`Creator asset service listening on http://localhost:${port}`));

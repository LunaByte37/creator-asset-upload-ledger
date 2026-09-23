import { infrai } from "./infrai_storage";

const name = process.env.ASSET_BUCKET ?? "creator-commerce-assets";
await infrai.storage.bucket.create({ name });
console.log(JSON.stringify({ bucket: name, ready: true }));

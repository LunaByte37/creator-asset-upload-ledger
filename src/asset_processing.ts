export type AssetCompletion = {
  assetId: string;
  objectKey: string;
  processing: "queued";
  subscriberUpdate: "pending";
};

export function decideAssetCompletion(
  input: { assetId: string; objectKey: string },
  objectFound: boolean,
): AssetCompletion | null {
  if (!objectFound) return null;
  return {
    assetId: input.assetId,
    objectKey: input.objectKey,
    processing: "queued",
    subscriberUpdate: "pending",
  };
}

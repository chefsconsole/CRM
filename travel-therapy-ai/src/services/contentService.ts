import { ContentAssetModel, CampaignModel, type ContentAssetDoc, type CampaignDoc } from "../db/models/index.js";

export async function saveContentAsset(input: {
  kind: string;
  title: string;
  body: string;
  channel?: string;
  tags?: string[];
  campaignId?: string;
  createdBy?: string;
}): Promise<ContentAssetDoc> {
  return ContentAssetModel.create({
    kind: input.kind,
    title: input.title,
    body: input.body,
    channel: input.channel,
    tags: input.tags ?? [],
    campaign: input.campaignId,
    createdBy: input.createdBy,
    status: "draft",
  });
}

export async function scheduleCampaign(input: {
  name: string;
  channel: string;
  objective?: string;
  theme?: string;
  daysFromNow?: number;
  brief?: string;
  createdBy?: string;
}): Promise<CampaignDoc> {
  const scheduledFor =
    input.daysFromNow !== undefined
      ? new Date(Date.now() + input.daysFromNow * 86_400_000)
      : undefined;
  return CampaignModel.create({
    name: input.name,
    channel: input.channel,
    objective: input.objective,
    theme: input.theme,
    brief: input.brief,
    scheduledFor,
    status: scheduledFor ? "scheduled" : "planned",
    createdBy: input.createdBy,
  });
}

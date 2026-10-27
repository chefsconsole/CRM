import { db } from "../db";
import { priceHistoryEntry, validatePriceRange } from "../domain/pricing";
import type { DataVerification } from "@prisma/client";

export interface ConfigurationInput {
  label: string;
  bhk: number;
  carpetAreaMin: number | null;
  carpetAreaMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceVerification: DataVerification;
  availabilityNote: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  note?: string | null;
}

/** Creates or updates a configuration. Any price change is written to the append-only price history. */
export async function saveConfiguration(projectId: string, configId: string | null, input: ConfigurationInput, actorId: string) {
  validatePriceRange(input);
  return db.$transaction(async (tx) => {
    const prev = configId ? await tx.projectConfiguration.findFirstOrThrow({ where: { id: configId, projectId } }) : null;
    const history = priceHistoryEntry(
      { priceMin: prev?.priceMin ?? null, priceMax: prev?.priceMax ?? null },
      { priceMin: input.priceMin, priceMax: input.priceMax },
      { sourceName: input.sourceName ?? (prev ? null : "Initial listing"), sourceUrl: input.sourceUrl },
    );
    const data = {
      label: input.label,
      bhk: input.bhk,
      carpetAreaMin: input.carpetAreaMin,
      carpetAreaMax: input.carpetAreaMax,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      priceVerification: input.priceVerification,
      availabilityNote: input.availabilityNote,
    };
    const config = prev
      ? await tx.projectConfiguration.update({ where: { id: prev.id }, data })
      : await tx.projectConfiguration.create({ data: { ...data, projectId } });
    if (history) {
      await tx.priceHistory.create({
        data: { ...history, projectId, configurationId: config.id, configLabel: config.label, note: input.note ?? null, changedById: actorId },
      });
    }
    return { config, priceChanged: !!history };
  });
}

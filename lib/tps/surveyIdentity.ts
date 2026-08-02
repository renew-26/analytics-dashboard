export function buildIdentityKey(fields: string[], record: Record<string, unknown>): string {
  return fields
    .map((field) => {
      const value = record[field];
      if (value === undefined || value === null || String(value).trim() === "") {
        throw new Error(`Missing field "${field}" required for identity key`);
      }
      return String(value).trim().normalize("NFC");
    })
    .join("::");
}

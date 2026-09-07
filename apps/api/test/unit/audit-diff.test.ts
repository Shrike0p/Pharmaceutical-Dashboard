import { describe, expect, it } from "vitest";
import {
  AUDITED_CLEANING_RECORD_FIELDS,
  diffFields,
  isEmptyChangeSet,
} from "../../src/domain/audit/diff.ts";

/**
 * The diff engine decides what the audit trail says happened. If it is wrong,
 * the trail is a plausible-looking lie — so these cases cover its edges rather
 * than just its happy path.
 */

interface Record {
  cleanedById: string;
  cleanedAt: Date;
  method: string;
  notes: string | null;
  status: string;
  verifiedById: string | null;
  verifiedAt: Date | null;
}

const FIELDS = AUDITED_CLEANING_RECORD_FIELDS as readonly (keyof Record & string)[];

const baseRecord = (): Record => ({
  cleanedById: "user-1",
  cleanedAt: new Date("2026-09-01T10:00:00.000Z"),
  method: "CIP",
  notes: "Standard cleaning",
  status: "PENDING",
  verifiedById: null,
  verifiedAt: null,
});

describe("diffFields", () => {
  it("returns an empty change set when nothing changed", () => {
    const before = baseRecord();
    const changes = diffFields<Record>(before, { ...before }, FIELDS);

    expect(changes).toEqual({});
    expect(isEmptyChangeSet(changes)).toBe(true);
  });

  it("records only the field that actually changed", () => {
    const before = baseRecord();

    const changes = diffFields<Record>(before, { notes: "Additional rinse performed" }, FIELDS);

    // The essential property: an unrelated field must not appear just because
    // the caller sent the whole object.
    expect(changes).toEqual({
      notes: { old: "Standard cleaning", new: "Additional rinse performed" },
    });
    expect(Object.keys(changes)).toHaveLength(1);
  });

  it("records every field that changed, and no others", () => {
    const before = baseRecord();

    const changes = diffFields<Record>(
      before,
      { status: "VERIFIED", verifiedById: "user-2", method: "CIP" },
      FIELDS,
    );

    expect(changes).toEqual({
      status: { old: "PENDING", new: "VERIFIED" },
      verifiedById: { old: null, new: "user-2" },
    });
    // `method` was supplied but unchanged, so it is absent.
    expect(changes).not.toHaveProperty("method");
  });

  it("treats a creation as every set field moving from null", () => {
    const created = baseRecord();

    const changes = diffFields<Record>(null, created, FIELDS);

    expect(changes).toEqual({
      cleanedById: { old: null, new: "user-1" },
      cleanedAt: { old: null, new: "2026-09-01T10:00:00.000Z" },
      method: { old: null, new: "CIP" },
      notes: { old: null, new: "Standard cleaning" },
      status: { old: null, new: "PENDING" },
    });
    // Fields that are null on creation are not "changes" and stay out.
    expect(changes).not.toHaveProperty("verifiedById");
    expect(changes).not.toHaveProperty("verifiedAt");
  });

  it("records a value being set for the first time (null -> value)", () => {
    const changes = diffFields<Record>(baseRecord(), { verifiedById: "user-2" }, FIELDS);

    expect(changes).toEqual({ verifiedById: { old: null, new: "user-2" } });
  });

  it("records a value being cleared (value -> null)", () => {
    // Clearing a note is a real change and must be traceable.
    const changes = diffFields<Record>(baseRecord(), { notes: null }, FIELDS);

    expect(changes).toEqual({ notes: { old: "Standard cleaning", new: null } });
  });

  it("ignores fields absent from the patch, so an empty patch clears nothing", () => {
    // The distinction that matters on a PATCH: `{}` means "change nothing",
    // whereas `{ notes: null }` means "erase the notes". Conflating the two
    // would let an empty request body wipe a record and record it as intended.
    const changes = diffFields<Record>(baseRecord(), {}, FIELDS);

    expect(changes).toEqual({});
  });

  it("compares dates by value, not by object identity", () => {
    const before = baseRecord();
    const sameInstant = new Date(before.cleanedAt.getTime());

    // Two distinct Date objects for the same moment: `===` would call this a
    // change and every update would log a spurious cleanedAt transition.
    expect(diffFields<Record>(before, { cleanedAt: sameInstant }, FIELDS)).toEqual({});

    const later = new Date("2026-09-02T10:00:00.000Z");
    expect(diffFields<Record>(before, { cleanedAt: later }, FIELDS)).toEqual({
      cleanedAt: { old: "2026-09-01T10:00:00.000Z", new: "2026-09-02T10:00:00.000Z" },
    });
  });

  it("serialises dates as ISO strings so the change set is valid JSON", () => {
    const changes = diffFields<Record>(baseRecord(), { verifiedAt: new Date("2026-09-02T08:30:00.000Z") }, FIELDS);

    expect(changes["verifiedAt"]).toEqual({ old: null, new: "2026-09-02T08:30:00.000Z" });
    // Must survive a JSONB round trip unchanged.
    expect(JSON.parse(JSON.stringify(changes))).toEqual(changes);
  });

  it("ignores keys outside the audited allow-list", () => {
    const before = baseRecord();

    const changes = diffFields<Record>(
      before,
      { notes: "Updated", id: "hacked", createdAt: new Date(), injected: true } as never,
      FIELDS,
    );

    // A caller cannot get an arbitrary key into the audit trail by adding it to
    // the request body — only allow-listed fields are ever considered.
    expect(Object.keys(changes)).toEqual(["notes"]);
  });

  it("treats undefined and null as the same absent state", () => {
    const before = { ...baseRecord(), notes: null };

    // `notes` is already null; explicitly setting it to null is not a change.
    expect(diffFields<Record>(before, { notes: null }, FIELDS)).toEqual({});
  });
});

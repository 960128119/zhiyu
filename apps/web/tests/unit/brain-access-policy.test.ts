import { describe, expect, it } from "vitest";
import {
  canReadMemory,
  canWriteMemory,
  validateMemoryWrite,
  type BrainAccessGrant,
  type BrainMemory,
  type BrainRequester,
  type BrainWriteRequest,
} from "@/lib/brain";

const now = new Date("2026-08-10T01:00:00.000Z");

function memory(overrides: Partial<BrainMemory> = {}): BrainMemory {
  return {
    id: "memory-1",
    userId: "user-1",
    scope: { type: "workshop", workshopId: "workshop-a" },
    ownerType: "work",
    ownerId: "work-a",
    memoryType: "plan",
    subject: "Monday plan",
    content: "Review current watchlist before placing simulated trades.",
    status: "active",
    confidence: 85,
    evidenceRefs: ["event-1"],
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function workRequester(overrides: Partial<BrainRequester> = {}): BrainRequester {
  return {
    type: "work",
    userId: "user-1",
    id: "work-a",
    workshopId: "workshop-a",
    ...overrides,
  };
}

function writeRequest(overrides: Partial<BrainWriteRequest> = {}): BrainWriteRequest {
  return {
    requester: workRequester(),
    targetScope: { type: "workshop", workshopId: "workshop-a" },
    ownerType: "work",
    ownerId: "work-a",
    memoryType: "plan",
    status: "active",
    confidence: 80,
    evidenceRefs: ["event-1"],
    ...overrides,
  };
}

describe("brain access policy", () => {
  it("allows a work to read and write its own workshop memory", () => {
    expect(
      canReadMemory({ memory: memory(), requester: workRequester(), now }),
    ).toMatchObject({ allowed: true, reason: "same_work_owner" });

    expect(
      canWriteMemory({ request: writeRequest(), now }),
    ).toMatchObject({ allowed: true, reason: "same_work_owner" });
  });

  it("denies another work unless an explicit reference grant exists", () => {
    const requester = workRequester({ id: "work-b", workshopId: "workshop-b" });

    expect(
      canReadMemory({ memory: memory(), requester, now }),
    ).toMatchObject({ allowed: false, reason: "no_matching_grant" });

    const grants: BrainAccessGrant[] = [
      {
        id: "grant-1",
        userId: "user-1",
        subjectType: "work",
        subjectId: "work-b",
        scope: { type: "workshop", workshopId: "workshop-a" },
        permissions: ["reference"],
        memoryTypes: ["plan"],
      },
    ];

    expect(
      canReadMemory({ memory: memory(), requester, grants, now }),
    ).toMatchObject({ allowed: true, reason: "explicit_grant" });
  });

  it("lets chat use owner override while strict mode still needs grants", () => {
    const requester: BrainRequester = {
      type: "chat",
      userId: "user-1",
      id: "chat",
    };

    expect(
      canReadMemory({ memory: memory(), requester, accessMode: "strict", now }),
    ).toMatchObject({ allowed: false, reason: "no_matching_grant" });

    expect(
      canReadMemory({
        memory: memory(),
        requester,
        accessMode: "owner_override",
        now,
      }),
    ).toMatchObject({ allowed: true, reason: "owner_override" });
  });

  it("keeps tools isolated by default", () => {
    const requester: BrainRequester = {
      type: "tool",
      userId: "user-1",
      id: "quant-tool",
    };

    expect(
      canReadMemory({ memory: memory(), requester, now }),
    ).toMatchObject({ allowed: false, reason: "tool_requires_grant" });
  });

  it("validates evidence, confidence and write ownership", () => {
    const issues = validateMemoryWrite({
      request: writeRequest({
        requester: workRequester({ id: "work-b" }),
        ownerId: "work-a",
        confidence: 120,
        evidenceRefs: [],
      }),
      now,
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "confidence_out_of_range",
      "evidence_required",
      "write_not_allowed",
    ]);
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  beginAppRegistration,
  pollAppRegistrationOnce,
} from "../../../../packages/integrations/feishu/src/app-registration";

describe("Feishu app registration", () => {
  it("keeps Feishu's verification URI unchanged", async () => {
    const verificationUri =
      "https://open.feishu.cn/page/launcher?user_code=ABCD-1234";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          device_code: "device-code",
          user_code: "ABCD-1234",
          verification_uri: "https://open.feishu.cn/page/launcher",
          verification_uri_complete: verificationUri,
          expires_in: 600,
          interval: 5,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(beginAppRegistration("feishu")).resolves.toMatchObject({
      qrUrl: verificationUri,
      expireInSec: 600,
      intervalSec: 5,
    });

    fetchMock.mockRestore();
  });

  it("uses the official QR URL as-is and omits tp when polling by default", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "authorization_pending",
          error_description: "",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await pollAppRegistrationOnce({
      domain: "feishu",
      deviceCode: "device-code",
      currentIntervalSec: 5,
      domainAlreadySwitched: false,
    });

    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get("tp")).toBeNull();

    fetchMock.mockRestore();
  });

  it("treats OAuth polling errors in HTTP 400 responses as business states", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "authorization_pending",
            error_description: "",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    await expect(
      pollAppRegistrationOnce({
        domain: "feishu",
        deviceCode: "device-code",
        currentIntervalSec: 5,
        domainAlreadySwitched: false,
      }),
    ).resolves.toEqual({
      kind: "pending",
      nextDomain: "feishu",
      nextIntervalSec: 5,
      reason: "authorization_pending",
      code: undefined,
    });

    fetchMock.mockRestore();
  });

  it("surfaces denied polling responses instead of retrying forever", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "access_denied",
            error_description: "",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    await expect(
      pollAppRegistrationOnce({
        domain: "feishu",
        deviceCode: "device-code",
        currentIntervalSec: 5,
        domainAlreadySwitched: false,
      }),
    ).resolves.toEqual({ kind: "denied" });

    fetchMock.mockRestore();
  });
});

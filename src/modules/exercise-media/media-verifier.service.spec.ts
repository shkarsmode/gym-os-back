import { MediaVerifierService } from "./media-verifier.service";
import { MEDIA_SENTINEL_URLS } from "./media.constants";

// Gate B is the only thing standing between a scored candidate and the user's screen,
// so every rejection reason gets its own case. No network: fetch is stubbed.
describe("MediaVerifierService", () => {
    const originalFetch = global.fetch;
    let calls: string[];

    function respond(status: number, headers: Record<string, string>) {
        return {
            status,
            headers: { get: (name: string) => headers[name.toLowerCase()] ?? null }
        } as unknown as Response;
    }

    function stubFetch(handler: (url: string) => Response | null) {
        calls = [];
        global.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            calls.push(url);
            const response = handler(url);
            if (!response) {
                throw new Error("network down");
            }
            return response;
        }) as typeof fetch;
    }

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it("rejects the soft-404 sentinel without touching the network", async () => {
        stubFetch(() => respond(200, { "content-type": "image/jpeg", "content-length": "40000" }));
        const service = new MediaVerifierService();

        await expect(service.probe(MEDIA_SENTINEL_URLS[0])).resolves.toBeNull();
        expect(calls).toHaveLength(0);
    });

    it("rejects a 404", async () => {
        stubFetch(() => respond(404, { "content-type": "text/html" }));
        const service = new MediaVerifierService();

        await expect(service.probe("https://fitnessprogramer.com/wp-content/uploads/2021/02/Nope.gif")).resolves.toBeNull();
    });

    it("rejects a 200 that is not an image, which is what a soft-404 page looks like", async () => {
        stubFetch(() => respond(200, { "content-type": "text/html; charset=utf-8" }));
        const service = new MediaVerifierService();

        await expect(service.probe("https://fitnessprogramer.com/exercise/unknown/")).resolves.toBeNull();
    });

    it("rejects a network failure rather than passing it through optimistically", async () => {
        stubFetch(() => null);
        const service = new MediaVerifierService();

        await expect(service.probe("https://fitnessprogramer.com/wp-content/uploads/2021/02/Dead.gif")).resolves.toBeNull();
    });

    it("rejects a placeholder smaller than a real demo image", async () => {
        stubFetch(() => respond(200, { "content-type": "image/gif", "content-length": "42" }));
        const service = new MediaVerifierService();

        await expect(service.probe("https://fitnessprogramer.com/pixel.gif")).resolves.toBeNull();
    });

    it("accepts a real gif and reports the content type", async () => {
        stubFetch(() => respond(200, { "content-type": "image/gif", "content-length": "325033" }));
        const service = new MediaVerifierService();

        await expect(service.probe("https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bent-Over-Row.gif")).resolves.toEqual({
            url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bent-Over-Row.gif",
            contentType: "image/gif",
            bytes: 325033,
            mediaType: "gif"
        });
    });

    it("demotes a .gif URL that actually serves a still image", async () => {
        stubFetch(() => respond(200, { "content-type": "image/jpeg", "content-length": "90000" }));
        const service = new MediaVerifierService();
        const result = await service.probe("https://fitnessprogramer.com/wp-content/uploads/2021/02/Liar.gif");

        expect(result?.mediaType).toBe("image");
    });

    it("retries with a ranged GET when the origin refuses HEAD", async () => {
        stubFetch((url) => (calls.filter((call) => call === url).length > 1
            ? respond(206, { "content-type": "image/gif", "content-length": "1024" })
            : respond(405, {})));
        const service = new MediaVerifierService();
        const result = await service.probe("https://fitnessprogramer.com/no-head.gif");

        expect(result?.mediaType).toBe("gif");
        expect(calls).toHaveLength(2);
    });

    it("serves a repeat probe from cache", async () => {
        stubFetch(() => respond(200, { "content-type": "image/gif", "content-length": "200000" }));
        const service = new MediaVerifierService();
        await service.probe("https://fitnessprogramer.com/cached.gif");
        await service.probe("https://fitnessprogramer.com/cached.gif");

        expect(calls).toHaveLength(1);
    });

    it("returns only what verified and reports how many were attempted", async () => {
        stubFetch((url) => (url.includes("good")
            ? respond(200, { "content-type": "image/gif", "content-length": "200000" })
            : respond(404, { "content-type": "text/html" })));
        const service = new MediaVerifierService();
        const batch = await service.verifyAll([
            "https://fitnessprogramer.com/good-1.gif",
            "https://fitnessprogramer.com/bad-1.gif",
            "https://fitnessprogramer.com/good-2.gif"
        ]);

        expect(batch.attempted).toBe(3);
        expect(batch.timedOut).toBe(false);
        expect([...batch.verified.keys()].sort()).toEqual([
            "https://fitnessprogramer.com/good-1.gif",
            "https://fitnessprogramer.com/good-2.gif"
        ]);
    });
});

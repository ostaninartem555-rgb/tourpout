import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { cache, waveform } from "./providers.js";

async function withServer(sources, run, fetchAudio) {
  cache.flushAll();
  const server = createApp(sources, fetchAudio).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test("search returns surviving source and caches successful results", async () => {
  let calls = 0;
  const sources = {
    yt: {
      search: async () => {
        throw new Error("offline");
      },
    },
    sc: {
      search: async () => {
        calls++;
        return [{ id: "123", source: "sc", title: "Example" }];
      },
    },
  };
  await withServer(sources, async (base) => {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${base}/api/search?q=sample`);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.tracks[0].id, "123");
      assert.equal(result.errors[0].source, "yt");
    }
    assert.equal(calls, 1);
  });
});
test("source failures and invalid requests have explicit statuses", async () => {
  const fail = {
    search: async () => {
      throw new Error();
    },
  };
  await withServer({ yt: fail, sc: fail }, async (base) => {
    assert.equal((await fetch(`${base}/api/search?q=sample`)).status, 503);
    for (const route of [
      "/api/search",
      "/api/search?q=x&source=invalid",
      "/api/stream?id=http://localhost&source=sc",
      "/api/recommendations?id=123&source=bad",
    ]) {
      assert.equal((await fetch(base + route)).status, 400);
    }
  });
});
test("audio proxy forwards Range, binary bytes, CORS and 416 metadata", async () => {
  const sources = {
    sc: {
      stream: async () => ({
        url: "https://audio.example/track",
        protocol: "progressive",
      }),
    },
  };
  const fetchAudio = async (_url, options) => {
    if (options.headers.Range === "bytes=99-")
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": "bytes */10" },
      });
    assert.equal(options.headers.Range, "bytes=2-5");
    return new Response(Uint8Array.from([2, 3, 4, 5]), {
      status: 206,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": "4",
        "Content-Range": "bytes 2-5/10",
        "Accept-Ranges": "bytes",
      },
    });
  };
  await withServer(
    sources,
    async (base) => {
      const response = await fetch(`${base}/api/stream?id=123&source=sc`, {
        headers: { Range: "bytes=2-5" },
      });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
      assert.deepEqual(
        [...new Uint8Array(await response.arrayBuffer())],
        [2, 3, 4, 5],
      );
      const invalid = await fetch(`${base}/api/stream?id=123&source=sc`, {
        headers: { Range: "bytes=99-" },
      });
      assert.equal(invalid.status, 416);
      assert.equal(invalid.headers.get("content-range"), "bytes */10");
    },
    fetchAudio,
  );
});
test("recommendations return selected provider tracks", async () => {
  await withServer(
    {
      sc: {
        recommendations: async (id) =>
          Array.from({ length: 20 }, (_, i) => ({
            id: `${id}${i}`,
            source: "sc",
          })),
      },
    },
    async (base) => {
      const response = await fetch(
        `${base}/api/recommendations?id=12&source=sc`,
      );
      assert.equal((await response.json()).tracks.length, 20);
    },
  );
});
test("waveform is stable, bounded and contains 60 samples", () => {
  assert.deepEqual(waveform("abcdefghijk"), waveform("abcdefghijk"));
  assert.notDeepEqual(waveform("abcdefghijk"), waveform("abcdefghijl"));
  assert.equal(waveform("abcdefghijk").length, 60);
  assert.ok(waveform("abcdefghijk").every((n) => n >= 0.15 && n <= 1));
});

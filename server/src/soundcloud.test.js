import test from "node:test";
import assert from "node:assert/strict";
import { cache, providers } from "./providers.js";

test("refreshes SoundCloud keys, preserves Cyrillic and prefers progressive MP3", async (t) => {
  const keys = ["A".repeat(32), "B".repeat(32), "C".repeat(32)];
  let pages = 0;
  const formats = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    assert.match(options.headers["User-Agent"], /Mozilla/);
    if (url.hostname === "soundcloud.com") {
      pages++;
      return new Response(
        '<script src="https://a-v2.sndcdn.com/assets/test.js"></script>',
      );
    }
    if (url.hostname === "a-v2.sndcdn.com") {
      return new Response(`client_id:"${keys[pages - 1]}"`);
    }
    const id = url.searchParams.get("client_id");
    switch (url.pathname) {
      case "/search/tracks":
        assert.equal(url.searchParams.get("q"), "Мэдкид");
        return id === keys[0]
          ? new Response(null, { status: 403 })
          : Response.json({
              collection: [
                {
                  id: 1,
                  title: "Трек",
                  duration: 24000,
                  playback_count: 45800,
                  user: { id: 8, username: "Мэдкид", followers_count: 12 },
                },
              ],
            });
      case "/users/8":
        return Response.json({ followers_count: 13 });
      case "/users/8/toptracks":
        return Response.json({
          collection: [{ playback_count: 12 }, { playback_count: 38 }, {}],
        });
      case "/tracks/1":
        return Response.json({
          id: 1,
          media: {
            transcodings: [
              {
                url: "https://api-v2.soundcloud.com/hls",
                format: { protocol: "hls", mime_type: "audio/mpeg" },
              },
              {
                url: "https://api-v2.soundcloud.com/mp3",
                format: { protocol: "progressive", mime_type: "audio/mpeg" },
              },
            ],
          },
        });
      case "/mp3":
        formats.push("mp3");
        return id === keys[1]
          ? new Response("")
          : Response.json({ url: "https://media.sndcdn.com/track.mp3" });
      default:
        throw new Error(`Unexpected request ${url.pathname}`);
    }
  });
  cache.del("client:sc");
  const [track] = await providers.sc.search("Мэдкид");
  assert.equal(track.trackStats.soundcloudPlays, 45800);
  assert.equal(track.trackStats.youtubePlays, null);
  assert.equal(track.artistStats.soundcloudPlays, 50);
  assert.equal(track.artistStats.soundcloudFollowers, 13);
  assert.equal((await providers.sc.stream("1")).protocol, "progressive");
  assert.deepEqual(formats, ["mp3", "mp3"]);
  assert.equal(pages, 3);
});

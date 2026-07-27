import assert from "node:assert/strict";
import test from "node:test";
import { runProductionServer } from "../scripts/start-production.mjs";

test("production server serves its client assets and Agent API", async () => {
  const { server, port } = await runProductionServer({ port: 0, host: "127.0.0.1" });
  const origin = `http://127.0.0.1:${port}`;

  try {
    const homeResponse = await fetch(`${origin}/`);
    assert.equal(homeResponse.status, 200);
    const html = await homeResponse.text();
    const assetPath = html.match(/(?:src|href)="(\/assets\/index-[^"]+\.(?:js|css))"/)?.[1];
    assert.ok(assetPath, "expected the rendered page to reference a built client asset");

    const assetResponse = await fetch(`${origin}${assetPath}`);
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get("content-type") ?? "", /javascript|text\/css/);

    const apiResponse = await fetch(`${origin}/api/agents`);
    assert.equal(apiResponse.status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

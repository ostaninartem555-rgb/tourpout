import { createApp } from "./app.js";
import { initialize, status } from "./providers.js";
const port = Number(process.env.PORT || 3001);
const server = createApp().listen(port, "0.0.0.0", () =>
  console.log(`WaveMusic API listening on ${port}`),
);
initialize().then(() => console.log("Source initialization", status));
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));

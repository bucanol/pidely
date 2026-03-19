import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));

(async () => {
  setupAuth(app);
  setupWebSocket(httpServer);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error("Internal Server Error:", err);
    res.status(status).json({ message: err.message || "Internal Server Error" });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    console.log(`serving on port ${port}`);
  });
})();
/**
 * Local Development Server for Interactive Visualizations
 *
 * This module provides a simple HTTP server for serving interactive web-based visualizations
 * and reports. It's designed for development/demo purposes where data needs to be visualized
 * in a browser with user interaction.
 *
 * Key Features:
 * - Static file serving from multiple base directories
 * - Special handling for data files (JSON)
 * - API endpoint for receiving user reports/interactions
 * - Automatic browser launching
 * - Import statement removal for ESM → browser compatibility
 * - Graceful shutdown on browser close or Ctrl+C
 *
 * Server Workflow:
 * 1. Start HTTP server on specified port
 * 2. Serve static assets from baseDirs
 * 3. Serve data files from specified paths
 * 4. Open browser automatically (Chrome preferred)
 * 5. Wait for:
 *    - Browser tab to close (detected by open() promise)
 *    - User to submit report via POST /api/report/
 *    - Manual shutdown (Ctrl+C)
 * 6. Return submitted data (if any) when shutting down
 *
 * Script Processing:
 * - Removes ES module import statements (convert to browser-compatible bundles)
 * - Strips source map comments
 * - Allows inline scripts without build step
 *
 * @example
 * const userReport = await launchServer<UserReport>(
 *   3000,
 *   ["public", "dist"],
 *   "data/analysis.json",
 *   "data/codebook.json"
 * );
 */

import {
    copyFileSync,
    existsSync,
    readdirSync,
    readFile,
    readFileSync,
    statSync,
    writeFileSync,
} from "fs";
import http from "http";
import { basename, extname, join } from "path";

import open, { apps } from "open";

import { ensureFolder } from "../io/file.js";
import { logger } from "../core/logger.js";
import { sleep } from "../core/misc.js";

/**
 * Launch a local HTTP server for interactive visualizations
 *
 * Serves static files and data, opens browser, waits for interaction or shutdown.
 *
 * @template T - Type of data expected from user report submission
 * @param port - Port number to listen on
 * @param baseDirs - Directories to serve static files from (searched in order)
 * @param dataFiles - Specific data files to serve by basename
 * @returns Promise resolving to user-submitted data (if any) when server shuts down
 */
export const launchServer = <T>(
    port: number,
    baseDirs: string[],
    ...dataFiles: string[]
): Promise<T | undefined> => {
    let shutdown: (data?: T) => void;
    // Create the server
    const server: http.Server = http.createServer(
        (req: http.IncomingMessage, res: http.ServerResponse) => {
            let url = req.url ?? "/";
            if (url === "/") {
                url = "/index.html";
            }
            // Handle dynamic requests
            if (url.startsWith("/api/report/")) {
                // Read the body
                let body = "";
                req.on("data", (chunk: Buffer) => {
                    body += chunk.toString();
                });
                req.on("end", () => {
                    const data = JSON.parse(body) as T;
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                    res.end(JSON.stringify(data));
                    shutdown(data);
                });
                return;
            }
            // Handle requests for data files specifically
            for (const dataFile of dataFiles) {
                if (url === `/${basename(dataFile)}`) {
                    sendData(res, dataFile);
                    return;
                }
            }
            // Serve files from the BaseDirectory
            for (const baseDir of baseDirs) {
                if (existsSync(join(baseDir, url))) {
                    sendData(res, join(baseDir, url));
                    return;
                }
            }
            // Handle 404 errors
            res.writeHead(404);
            res.end(`Error loading ${basename(url)}`);
        },
    );
    // Send data to the client
    const sendData = (res: http.ServerResponse, path: string) => {
        readFile(path, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end(`Error loading ${basename(path)}`);
                return;
            }
            // Determine content type by file extension
            const ext = extname(path).toLowerCase();
            let contentType = "text/html; charset=utf-8"; // Default content type
            let content = "";
            switch (ext) {
                case ".js":
                    contentType = "text/javascript; charset=utf-8";
                    content = data.toString();
                    // Remove all import statements
                    content = handleScript(content);
                    data = Buffer.from(content);
                    break;
                case ".css":
                    contentType = "text/css; charset=utf-8";
                    break;
                case ".json":
                    contentType = "application/json; charset=utf-8";
                    break;
                case ".svg":
                    contentType = "image/svg+xml";
                    break;
                case ".png":
                    contentType = "image/png";
                    break;
                case ".jpg":
                case ".jpeg":
                    contentType = "image/jpeg";
                    break;
            }
            res.writeHead(200, { "Content-Type": contentType });
            res.end(data);
        });
    };
    // Start the server
    return new Promise<T | undefined>((res, rej) => {
        server.listen(port, () => {
            void (async () => {
                logger.success(`Server running at http://localhost:${port}/`);
                logger.info("Press Ctrl+C to shut down the server.");
                // Automatically open the browser when the server starts
                // Wait for 5 seconds or the browser tab to close
                // On Windows, the browser tab may close prematurely, so we delay the shutdown
                await Promise.all([
                    open(`http://localhost:${port}/`, {
                        wait: true,
                        app: { name: apps.chrome },
                    }),
                    sleep(process.platform === "win32" ? 6000000 : 5000),
                ]);
                logger.success("The browser tab has closed, shutting down the server");
                shutdown();
            })();
        });
        // Handle server shutdown
        shutdown = (data) => {
            server.close((error) => {
                if (error) {
                    logger.warn(error.message);
                    rej(error); // Reject the promise on server close error
                } else {
                    logger.info("Server shut down gracefully");
                    res(data); // Resolve the promise when server closes successfully
                }
            });
        };
        // Listen for SIGINT (e.g., Ctrl+C) and SIGTERM (sent from OS shutdown, etc.)
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
    });
};

/**
 * Create a standalone offline bundle of the web application
 *
 * Copies all necessary files (HTML, CSS, JS, data) into a single directory
 * that can be opened directly in a browser without a server. Processes
 * JavaScript files to remove import statements.
 *
 * @param targetDir - Destination directory for the bundle
 * @param baseDirs - Source directories containing web assets
 * @param dataFiles - Data files to include in the bundle
 *
 * @example
 * createOfflineBundle(
 *   "dist/offline",
 *   ["public", "web"],
 *   "output/analysis.json"
 * );
 * // Creates self-contained bundle in dist/offline/
 */
export const createOfflineBundle = (
    targetDir: string,
    baseDirs: string[],
    ...dataFiles: string[]
) => {
    // Create the offline bundle directory
    const offlineBundleDir = ensureFolder(targetDir);
    // Copy the data files to the offline bundle directory
    for (const dataFile of dataFiles) {
        const name = basename(dataFile);
        copyFileSync(dataFile, join(offlineBundleDir, name));
    }
    // Copy the web files recursively to the offline bundle directory while keeping the structure
    const copyFiles = (src: string, dst: string) => {
        const files = readdirSync(src);
        for (const file of files) {
            const filePath = join(src, file);
            const stat = statSync(filePath);
            if (stat.isDirectory()) {
                const newDestination = ensureFolder(join(dst, file));
                copyFiles(filePath, newDestination);
            } else {
                const name = basename(filePath);
                if (name.endsWith(".ts") || name.startsWith("tsconfig")) {
                    // Skip TypeScript files and tsconfig.json
                    continue;
                }
                if (name.endsWith(".js")) {
                    let content = readFileSync(filePath, "utf8");
                    // Remove all import statements
                    content = handleScript(content);
                    writeFileSync(join(dst, name), content);
                } else {
                    copyFileSync(filePath, join(dst, name));
                }
            }
        }
    };
    for (const baseDir of baseDirs) {
        copyFiles(baseDir, offlineBundleDir);
    }
    logger.success(`Offline bundle created in: ${offlineBundleDir}`);
};

/** Filter a script content to exclude import statements. */
const handleScript = (content: string) =>
    content
        .replaceAll(/^.*import.*? from ['"][^/]*?['"];?$/gm, "")
        .replaceAll(/^\/\/# sourceMappingURL.*/gm, "");

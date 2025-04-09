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

import { ensureFolder } from "./file";
import { logger } from "./logger";
import { sleep } from "./misc";

/** Create a local server for interactivity. */
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
                    logger.error(error);
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

/** Create an offline bundle for the web application. */
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
                if (name.endsWith(".ts")) {
                    continue;
                } // Skip TypeScript files
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

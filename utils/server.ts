import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { setTimeout } from "timers/promises";

import chalk from "chalk";
import open, { apps } from "open";

import { EnsureFolder } from "./llms.js";

/** CreateServer: Create a local server for interactivity. */
export function CreateServer<T>(Port: number, BaseDirectories: string[], ...DataFiles: string[]): Promise<T | undefined> {
    let Shutdown: (Data?: T) => void;
    // Create the server
    const Server: http.Server = http.createServer((Request: http.IncomingMessage, Response: http.ServerResponse) => {
        let Url = Request.url ?? "/";
        if (Url === "/") {
            Url = "/index.html";
        }
        // Handle dynamic requests
        if (Url.startsWith("/api/report/")) {
            // Read the body
            let Body = "";
            Request.on("data", (chunk: Buffer) => {
                Body += chunk.toString();
            });
            Request.on("end", () => {
                const Data = JSON.parse(Body) as T;
                Response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                Response.end(JSON.stringify(Data));
                Shutdown(Data);
            });
            return;
        }
        // Handle requests for data files specifically
        for (const dataFile of DataFiles) {
            if (Url === `/${path.basename(dataFile)}`) {
                SendData(Response, dataFile);
                return;
            }
        }
        // Serve files from the BaseDirectory
        for (const BaseDirectory of BaseDirectories) {
            if (fs.existsSync(path.join(BaseDirectory, Url))) {
                SendData(Response, path.join(BaseDirectory, Url));
                return;
            }
        }
        // Handle 404 errors
        Response.writeHead(404);
        Response.end(`Error loading ${path.basename(Url)}`);
    });
    // Send data to the client
    const SendData = function (Response: http.ServerResponse, FilePath: string) {
        fs.readFile(FilePath, (err: NodeJS.ErrnoException | null, data: Buffer) => {
            if (err) {
                Response.writeHead(404);
                Response.end(`Error loading ${path.basename(FilePath)}`);
                return;
            }
            // Determine content type by file extension
            const ext: string = path.extname(FilePath).toLowerCase();
            let contentType = "text/html; charset=utf-8"; // Default content type
            let content = "";
            switch (ext) {
                case ".js":
                    contentType = "text/javascript; charset=utf-8";
                    content = data.toString();
                    // Remove all import statements
                    content = HandleScript(content);
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
            Response.writeHead(200, { "Content-Type": contentType });
            Response.end(data);
        });
    };
    // Start the server
    return new Promise<T | undefined>((Resolve, Reject) => {
        Server.listen(Port, () => {
            void (async () => {
                console.log(`Server running at http://localhost:${Port}/`);
                console.log("Press Ctrl+C to shut down the server.");
                // Automatically open the browser when the server starts
                // Wait for 5 seconds or the browser tab to close
                // On Windows, the browser tab may close prematurely, so we delay the shutdown
                await Promise.all([
                    open(`http://localhost:${Port}/`, { wait: true, app: { name: apps.chrome } }),
                    setTimeout(process.platform === "win32" ? 6000000 : 5000),
                ]);
                console.log("The browser tab has closed, shutting down the server.");
                Shutdown();
            })();
        });
        // Handle server shutdown
        Shutdown = (Data) => {
            Server.close((Error) => {
                if (Error) {
                    console.error("Failed to close server:", Error);
                    Reject(Error); // Reject the promise on server close error
                } else {
                    console.log("Server shut down gracefully.");
                    Resolve(Data); // Resolve the promise when server closes successfully
                }
            });
        };
        // Listen for SIGINT (e.g., Ctrl+C) and SIGTERM (sent from OS shutdown, etc.)
        process.on("SIGINT", Shutdown);
        process.on("SIGTERM", Shutdown);
    });
}

/** CreateOfflineBundle: Create an offline bundle for the web application. */
export function CreateOfflineBundle(TargetDirectory: string, BaseDirectories: string[], ...DataFiles: string[]) {
    // Create the offline bundle directory
    const OfflineBundleDirectory = TargetDirectory;
    EnsureFolder(OfflineBundleDirectory);
    // Copy the data files to the offline bundle directory
    for (const dataFile of DataFiles) {
        const name = path.basename(dataFile);
        fs.copyFileSync(dataFile, path.join(OfflineBundleDirectory, name));
    }
    // Copy the web files recursively to the offline bundle directory while keeping the structure
    const CopyFiles = function (Source: string, Destination: string) {
        const files = fs.readdirSync(Source);
        for (const file of files) {
            const filePath = path.join(Source, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                const newDestination = path.join(Destination, file);
                EnsureFolder(newDestination);
                CopyFiles(filePath, newDestination);
            } else {
                const name = path.basename(filePath);
                if (name.endsWith(".ts")) {
                    continue;
                } // Skip TypeScript files
                if (name.endsWith(".js")) {
                    let content = fs.readFileSync(filePath, "utf8");
                    // Remove all import statements
                    content = HandleScript(content);
                    fs.writeFileSync(path.join(Destination, name), content);
                } else {
                    fs.copyFileSync(filePath, path.join(Destination, name));
                }
            }
        }
    };
    for (const BaseDirectory of BaseDirectories) {
        CopyFiles(BaseDirectory, OfflineBundleDirectory);
    }
    console.log(chalk.blue(`Offline bundle created in: ${OfflineBundleDirectory}.`));
}

/** HandleScript: Filter a script content to exclude import statements. */
function HandleScript(Content: string): string {
    return Content.replaceAll(/^.*import.*? from ['"][^/]*?['"];?$/gm, "").replaceAll(/^\/\/# sourceMappingURL.*/gm, "");
}

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import open from 'open';

/** CreateServer: Create a local server for interactivity. */
export function CreateServer(Port: number, BaseDirectory: string, ...DataFiles: string[]): Promise<void> {
    var Shutdown: () => void;
    const Server: http.Server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
        var Url = req.url ?? "/";
        if (Url == "/") Url = "/index.html";

        // Handle requests for data files specifically
        for (const dataFile of DataFiles) {
            if (Url === `/${path.basename(dataFile)}`) {
                fs.readFile(dataFile, (err: NodeJS.ErrnoException | null, data: Buffer) => {
                    if (err) {
                        res.writeHead(404);
                        res.end(`Error loading ${path.basename(dataFile)}`);
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(data);
                    return;
                });
                return; // Exit the callback function after handling the data file
            }
        }

        // Serve files from the BaseDirectory
        let FilePath: string = path.join(BaseDirectory, Url);
        fs.readFile(FilePath, (err: NodeJS.ErrnoException | null, data: Buffer) => {
            if (err) {
                res.writeHead(404);
                res.end("Error loading file");
                return;
            }
            // Determine content type by file extension
            let ext: string = path.extname(FilePath).toLowerCase();
            let contentType: string = 'text/html'; // Default content type
            switch (ext) {
                case '.js':
                    contentType = 'text/javascript';
                    break;
                case '.css':
                    contentType = 'text/css';
                    break;
                case '.json':
                    contentType = 'application/json';
                    break;
                case '.png':
                    contentType = 'image/png';
                    break;
                case '.jpg':
                case '.jpeg':
                    contentType = 'image/jpeg';
                    break;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    });
    // Start the server
    return new Promise<void>((resolve, reject) => {
        Server.listen(Port, async () => {
            console.log(`Server running at http://localhost:${Port}/`);
            await open(`http://localhost:${Port}/`); // Automatically open the browser when the server starts
        });
        // Handle server shutdown
        Shutdown = () => {
            Server.close((err) => {
                if (err) {
                    console.error('Failed to close server:', err);
                    reject(err); // Reject the promise on server close error
                } else {
                    console.log('Server shut down gracefully.');
                    resolve(); // Resolve the promise when server closes successfully
                }
            });
        };
        // Listen for SIGINT (e.g., Ctrl+C) and SIGTERM (sent from OS shutdown, etc.)
        process.on('SIGINT', Shutdown);
        process.on('SIGTERM', Shutdown);
    });
}
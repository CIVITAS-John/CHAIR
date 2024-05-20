import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import open, { apps } from 'open';

/** CreateServer: Create a local server for interactivity. */
export function CreateServer(Port: number, BaseDirectory: string, ...DataFiles: string[]): Promise<void> {
    var Shutdown: () => void;
    const Server: http.Server = http.createServer((Request: http.IncomingMessage, Response: http.ServerResponse) => {
        var Url = Request.url ?? "/";
        if (Url == "/") Url = "/index.html";
        // Handle requests for data files specifically
        for (const dataFile of DataFiles) {
            if (Url === `/${path.basename(dataFile)}`) {
                SendData(Response, dataFile);
                return;
            }
        }
        // Serve files from the BaseDirectory
        SendData(Response, path.join(BaseDirectory, Url));
    });
    // Send data to the client
    const SendData = function(Response: http.ServerResponse, FilePath: string) {
        fs.readFile(FilePath, (err: NodeJS.ErrnoException | null, data: Buffer) => {
            if (err) {
                Response.writeHead(404);
                Response.end(`Error loading ${path.basename(FilePath)}`);
                return;
            }
            // Determine content type by file extension
            let ext: string = path.extname(FilePath).toLowerCase();
            let contentType: string = 'text/html; charset=utf-8'; // Default content type
            switch (ext) {
                case '.js':
                    contentType = 'text/javascript; charset=utf-8';
                    let content = data.toString();
                    // Remove all import statements
                    content = content.replaceAll(/^(.*)import(.*?)$/gm, '');
                    data = Buffer.from(content);
                    break;
                case '.css':
                    contentType = 'text/css; charset=utf-8';
                    break;
                case '.json':
                    contentType = 'application/json; charset=utf-8';
                    break;
                case '.png':
                    contentType = 'image/png';
                    break;
                case '.jpg':
                case '.jpeg':
                    contentType = 'image/jpeg';
                    break;
            }
            Response.writeHead(200, { 'Content-Type': contentType });
            Response.end(data);
        });
    }
    // Start the server
    return new Promise<void>((resolve, reject) => {
        Server.listen(Port, async () => {
            console.log(`Server running at http://localhost:${Port}/`);
            console.log('Press Ctrl+C to shut down the server.')
            await open(`http://localhost:${Port}/`, { wait: true, app: { name: apps.chrome } }); // Automatically open the browser when the server starts
            console.log('The browser tab has closed, shutting down the server.')
            Shutdown();
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
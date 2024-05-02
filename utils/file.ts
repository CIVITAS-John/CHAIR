import * as File from 'fs';
import * as Path from 'path';

/** GetFilesRecursively: Get all files in a directory recursively. */
export function GetFilesRecursively(Source: string): string[] {
    // Check if the source is a file
    if (File.statSync(Source).isFile()) return [Source];
    // Read all directory contents (files and directories)
    let files: string[] = [];
    const entries = File.readdirSync(Source, { withFileTypes: true });
    // Iterate through each entry
    for (let entry of entries) {
        // Full path of the current entry
        const fullPath = Path.join(Source, entry.name);
        if (entry.isDirectory()) {
            // If entry is a directory, recursively get files from it
            files = files.concat(GetFilesRecursively(fullPath));
        } else {
            // If entry is a file, add it to the files array
            files.push(fullPath);
        }
    }
    return files;
}
import commonPathPrefix from "common-path-prefix";
import * as File from "fs";
import * as Path from "path";

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

/** ReadOrBuildCache: Read or build a cache based on a hash. */
export async function ReadOrBuildCache<T>(CachePath: string, Hash: string, Build: () => Promise<T>): Promise<T> {
    // Check if the cache exists
    if (File.existsSync(CachePath + ".json") && File.existsSync(CachePath + ".hash")) {
        if (Hash == File.readFileSync(CachePath + ".hash", "utf8")) {
            console.log(`Reading cache from ${CachePath}.json.`);
            return JSON.parse(File.readFileSync(CachePath + ".json", "utf8"));
        }
    }
    // Build and write the cache
    var Data = await Build();
    var Content = JSON.stringify(Data, null, 4);
    File.writeFileSync(CachePath + ".json", Content);
    // Write the hash
    File.writeFileSync(CachePath + ".hash", Hash);
    return Data;
}

/** RemoveCommonality: Remove common prefixes and suffixes from a list of names. */
export function RemoveCommonality(Names: string[]): string[] {
    // If only one file, keep the file name
    if (Names.length == 1) return [Path.basename(Names[0])];
    // Find common prefixes and remove them
    var Prefix = commonPathPrefix(Names, Names[0].includes("\\") ? "\\" : "/");
    Names = Names.map((Name) => Name.substring(Prefix.length));
    Prefix = commonPathPrefix(Names, "-");
    Names = Names.map((Name) => Name.substring(Prefix.length));
    // Find common suffixes and remove them
    var Suffix = Reverse(
        commonPathPrefix(
            Names.map((Name) => Reverse(Name)),
            "-",
        ),
    );
    Names = Names.map((Name) => Name.substring(0, Name.length - Suffix.length));
    Names = Names.map((Name) => (Name == "" ? "root" : Name));
    return Names;
}

/** Reverse: Reverse a string. */
export function Reverse(S: string): string {
    return [...S].reverse().join("");
}

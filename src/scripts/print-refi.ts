/**
 * print-refi.ts - Test script for inspecting REFI-QDA file structure
 *
 * This script loads a REFI-QDA project file (.qdpx) and writes its internal
 * structure to JSON files in the input folder for inspection and debugging purposes.
 *
 * Usage:
 *   npm run print-refi -- <path-to-file.qdpx>
 *
 * Example:
 *   npm run print-refi -- ./data/my-project.qdpx
 */

// @ts-ignore - Package is missing TypeScript declarations
import { importQDPX } from "@skyloom/refi-qda/dist/index.js";
import { writeFile, mkdir } from "fs/promises";
import { dirname, join, basename } from "path";
import { createReadStream, createWriteStream } from "fs";
// @ts-ignore - Package is missing TypeScript declarations
import unzipper from "unzipper";

/**
 * Main function to load and print REFI-QDA project structure
 */
async function main() {
    // Get file path from command line arguments
    const filePath = process.argv[2];

    if (!filePath) {
        console.error("Error: No file path provided");
        console.error("Usage: npm run print-refi -- <path-to-file.qdpx>");
        process.exit(1);
    }

    try {
        console.log(`Loading REFI-QDA file: ${filePath}\n`);

        // Import the QDPX file with external source resolution
        const { project, missingExternalSources } = await importQDPX(filePath, {
            resolveExternalSources: true,
        });

        // Determine output directory (same as input file)
        const outputDir = dirname(filePath);
        const baseName = basename(filePath, ".qdpx");

        // Create summary object
        const summary: Record<string, unknown> = {
            projectName: project.name || "N/A",
            creationDate: project.creationDateTime || "N/A",
        };

        // Count and add key components to summary
        if (project.Users?.User) {
            summary.usersCount = project.Users.User.length;
        }

        if (project.Sources) {
            const sourceTypes = [
                "TextSource",
                "PictureSource",
                "PDFSource",
                "AudioSource",
                "VideoSource",
            ] as const;
            const sourceCounts: Record<string, number> = {};
            for (const sourceType of sourceTypes) {
                const sources = project.Sources[sourceType];
                if (sources && sources.length > 0) {
                    sourceCounts[sourceType] = sources.length;
                }
            }
            if (Object.keys(sourceCounts).length > 0) {
                summary.sources = sourceCounts;
            }
        }

        if (project.CodeBook?.Codes?.Code) {
            summary.codesCount = project.CodeBook.Codes.Code.length;
        }

        if (project.Cases?.Case) {
            summary.casesCount = project.Cases.Case.length;
        }

        if (project.Sets?.Set) {
            summary.setsCount = project.Sets.Set.length;
        }

        // Report missing external sources if any
        if (missingExternalSources && missingExternalSources.length > 0) {
            summary.missingExternalSources = missingExternalSources;
        }

        // Write files
        console.log(`Writing output files to: ${outputDir}\n`);

        // Write full project structure
        const projectFile = join(outputDir, `${baseName}-full-project.json`);
        await writeFile(projectFile, JSON.stringify(project, null, 2));
        console.log(`✓ Written full project structure: ${projectFile}`);

        // Write summary
        const summaryFile = join(outputDir, `${baseName}-summary.json`);
        await writeFile(summaryFile, JSON.stringify(summary, null, 2));
        console.log(`✓ Written project summary: ${summaryFile}`);

        // Write individual sections if they exist
        if (project.Sources) {
            const sourcesFile = join(outputDir, `${baseName}-sources.json`);
            await writeFile(sourcesFile, JSON.stringify(project.Sources, null, 2));
            console.log(`✓ Written sources: ${sourcesFile}`);
        }

        if (project.CodeBook) {
            const codeBookFile = join(outputDir, `${baseName}-codebook.json`);
            await writeFile(codeBookFile, JSON.stringify(project.CodeBook, null, 2));
            console.log(`✓ Written codebook: ${codeBookFile}`);
        }

        if (project.Cases) {
            const casesFile = join(outputDir, `${baseName}-cases.json`);
            await writeFile(casesFile, JSON.stringify(project.Cases, null, 2));
            console.log(`✓ Written cases: ${casesFile}`);
        }

        if (project.Sets) {
            const setsFile = join(outputDir, `${baseName}-sets.json`);
            await writeFile(setsFile, JSON.stringify(project.Sets, null, 2));
            console.log(`✓ Written sets: ${setsFile}`);
        }

        if (project.Users) {
            const usersFile = join(outputDir, `${baseName}-users.json`);
            await writeFile(usersFile, JSON.stringify(project.Users, null, 2));
            console.log(`✓ Written users: ${usersFile}`);
        }

        // Extract sources folder from the QDPX file
        console.log("\nExtracting sources folder...");
        const sourcesOutputDir = join(outputDir, "sources");
        await mkdir(sourcesOutputDir, { recursive: true });

        await new Promise<void>((resolve, reject) => {
            createReadStream(filePath)
                .pipe(unzipper.Parse())
                .on("entry", (entry: any) => {
                    const fileName = entry.path;
                    if (fileName.startsWith("sources/")) {
                        const outputPath = join(outputDir, fileName);
                        const entryDir = dirname(outputPath);
                        mkdir(entryDir, { recursive: true }).then(() => {
                            entry.pipe(createWriteStream(outputPath));
                        });
                    } else {
                        entry.autodrain();
                    }
                })
                .on("error", reject)
                .on("finish", resolve);
        });

        console.log(`✓ Extracted sources to: ${sourcesOutputDir}`);

        console.log("\n=== Export complete ===");
    } catch (error) {
        console.error("Error loading REFI-QDA file:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
            console.error("Stack trace:", error.stack);
        }
        process.exit(1);
    }
}

// Run the main function
main();

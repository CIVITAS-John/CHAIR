/**
 * print-refi.ts - Test script for inspecting REFI-QDA file structure
 *
 * This script loads a REFI-QDA project file (.qdpx) and prints its internal
 * structure to the console for inspection and debugging purposes.
 *
 * Usage:
 *   npm run print-refi -- <path-to-file.qdpx>
 *
 * Example:
 *   npm run print-refi -- ./data/my-project.qdpx
 */

// @ts-ignore - Package is missing TypeScript declarations
import { importQDPX } from "@skyloom/refi-qda/dist/index.js";

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

        // Print the complete project structure
        console.log("=== REFI-QDA Project Structure ===\n");
        console.log(JSON.stringify(project, null, 2));

        // Print summary information
        console.log("\n=== Project Summary ===");
        console.log(`Project Name: ${project.name || "N/A"}`);
        console.log(`Creation Date: ${project.creationDateTime || "N/A"}`);

        // Count and display key components
        if (project.Users?.User) {
            console.log(`Users: ${project.Users.User.length}`);
        }

        if (project.Sources) {
            const sourceTypes = [
                "TextSource",
                "PictureSource",
                "PDFSource",
                "AudioSource",
                "VideoSource",
            ] as const;
            console.log("\nSources:");
            for (const sourceType of sourceTypes) {
                const sources = project.Sources[sourceType];
                if (sources && sources.length > 0) {
                    console.log(`  ${sourceType}: ${sources.length}`);
                }
            }
        }

        if (project.CodeBook?.Codes?.Code) {
            console.log(`\nCodes: ${project.CodeBook.Codes.Code.length}`);
        }

        if (project.Cases?.Case) {
            console.log(`Cases: ${project.Cases.Case.length}`);
        }

        if (project.Sets?.Set) {
            console.log(`Sets: ${project.Sets.Set.length}`);
        }

        // Report missing external sources if any
        if (missingExternalSources && missingExternalSources.length > 0) {
            console.log(`\nMissing External Sources: ${missingExternalSources.length}`);
            missingExternalSources.forEach((path: string) => {
                console.log(`  - ${path}`);
            });
        }

        console.log("\n=== End of Report ===");
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

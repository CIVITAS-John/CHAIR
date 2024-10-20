// This is a playground for selectively translating data.
import * as File from "fs";
import { GetMessagesPath, GetProjectsPath, LoadCodedConversations, LoadChunksForAnalysis, LoadItems } from "../../utils/loader.js";
import { ExportChunksForCoding, ExportProjects, Range } from "../../utils/export.js";
import { Project } from "../../utils/schema.js";
import { LoadCache } from "./general.js";
import { LLMName, UseLLM } from "../../utils/llms.js";
import { TranslateProjects } from "./physics-lab.js";
import { ProcessConversations } from "./message-groups.js";

// Initialize
UseLLM("gpt-4.5-omni");
LoadCache();

// Translate datasets 1, 2
await ProcessConversations("Users of Physics Lab (Group 1)", Range(0, 17), "Coded Dataset 2");
await ProcessConversations("Users of Physics Lab (Group 2)", Range(0, 16), "Coded Dataset 1");

// Translate projects
// await ProjectPlayground(false);

console.log("Translation done.");
process.exit(0);

/** UpdateTranslations: Update translations for coded conversations. */
// await UpdateTranslations("Coded Dataset 1", "0~16-gpt-4.5-omni.json", "human/0~16-gpt-3.5-turbo-John.xlsx");
async function UpdateTranslations(Group: string, Name: string, Codebook: string) {
    Codebook = GetMessagesPath(Group, Codebook);
    var Threads = await LoadCodedConversations(Codebook);
    var Conversations = LoadChunksForAnalysis(Group, Name);
    // Write the result into an Excel file
    var Book = ExportChunksForCoding(Object.values(Conversations), Threads);
    await Book.xlsx.writeFile(Codebook.replace(".xlsx", "-new.xlsx"));
}

/** ProjectPlayground: Translate certain projects. */
async function ProjectPlayground(Bilingual: boolean = false) {
    var Projects = LoadItems<Project>(GetProjectsPath("Projects.json"));
    var StartDate = new Date(2019, 8, 24);
    var EndDate = new Date(2019, 8, 25);
    // By default we don't want system messages
    Projects = Projects.filter((Project) => Project.Time >= StartDate && Project.Time < EndDate);
    var Originals = JSON.parse(JSON.stringify(Projects)) as Project[];
    console.log(
        `Projects to translate: ${Projects.length} with comments ${Projects.reduce(
            (Sum, Project) => Sum + (Project.AllItems ? Project.AllItems.length : 0),
            0,
        )}`,
    );
    // Translate the projects with LLM
    Projects = await TranslateProjects(Projects);
    // Write into JSON file
    File.writeFileSync(GetProjectsPath(`Projects-Translated-${LLMName}.json`), JSON.stringify(Projects, null, 4));
    // Write into Markdown file
    File.writeFileSync(GetProjectsPath(`Projects-Translated-${LLMName}.md`), ExportProjects(Projects, Bilingual ? Originals : undefined));
}

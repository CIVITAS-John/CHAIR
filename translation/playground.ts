// This is a playground for selectively translating data.
import * as File from 'fs';
import { GetProjectsPath, LoadProjects } from "../utils/loader.js";
import { UseLLM } from "./general.js";
import { ExportProjects } from '../utils/export.js';
import { Project } from '../utils/schema.js';
import { LLMName } from '../utils/llms.js';
import { TranslateProjects } from './physics-lab.js';
import { TranslateConversation } from './message-groups.js';

// UseLLM("mistral-small");
UseLLM("gpt-3.5-turbo");
// UseLLM("gpt-4.5-turbo");
// UseLLM("claude3-haiku");
// UseLLM("claude3-sonnet");
await TranslateConversation("Users of Physics Lab (Group 1)", 1, false);
// await ProjectPlayground(false);
console.log("Translation done.");

/** ProjectPlayground: Translate certain projects. */
async function ProjectPlayground(Bilingual: boolean = false) {
    var Projects = LoadProjects();
    var StartDate = new Date(2019, 8, 24);
    var EndDate = new Date(2019, 8, 25);
    // By default we don't want system messages
    Projects = Projects.filter(Project => Project.Time >= StartDate && Project.Time < EndDate);
    var Originals = JSON.parse(JSON.stringify(Projects)) as Project[]; 
    console.log(`Projects to translate: ${Projects.length} with comments ${Projects.reduce((Sum, Project) => Sum + (Project.Comments ? Project.Comments.length : 0), 0)}`);
    // Translate the projects with LLM
    Projects = await TranslateProjects(Projects);
    // Write into JSON file
    File.writeFileSync(GetProjectsPath(`Projects-Translated-${LLMName}.json`), JSON.stringify(Projects, null, 4));
    // Write into Markdown file
    File.writeFileSync(GetProjectsPath(`Projects-Translated-${LLMName}.md`), ExportProjects(Projects, Bilingual ? Originals : undefined));
}
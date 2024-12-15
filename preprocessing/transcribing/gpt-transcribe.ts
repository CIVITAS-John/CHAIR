import File from "fs";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { RequestLLM, UseLLM } from "../../utils/llms.js";
import { GetDatasetPath } from "../../utils/loader.js";

UseLLM("gpt-4.5-audio");
// Load the media file
const AudioData = File.readFileSync(`${GetDatasetPath()}/recording.mp3`);
const AudioBase64 = AudioData.toString("base64");
// Request the transcription
/*await RequestLLM([
    new SystemMessage("Produce an accurate, annotated transcript using the input audio with Jefferson Transcription System Symbols. Identify different speakers."),
    new HumanMessage({
        content: [
            {
                type: "input_audio",
                input_audio: {
                    data: AudioBase64,
                    format: "mp3"
                }
            }
        ]
    })
]);*/
await RequestLLM([
    new SystemMessage(
        "Annotate the input transcript using the input audio with Jefferson Transcription System Symbols. For example, mark the pauses in the speech.",
    ),
    new HumanMessage(
        "So, now let's try to do the interactive session. We all know that generative AIs are evolving very rapidly, and their capabilities could be very different from what we already know in 2023. So today, we're going to try something here and now. We will try to send a modeling idea to a powerful generative AI model with the same prompt as our users used before: \"How can you help me make an analogical model using the following idea?\" We will preview the OpenAI model that claims to be reasoning. While we have tested many other models, the one previewed is currently the best. We will compare the generative AI model's results with human modeling ideas, and we will come up with a simple agent-based modeling idea. Okay, so we may end up having many ideas, but due to the time constraints, I will try to choose the most popular ones and merge them sort of into an idea for us to try together today.",
    ),
    new HumanMessage({
        content: [
            {
                type: "input_audio",
                input_audio: {
                    data: AudioBase64,
                    format: "mp3",
                },
            },
        ],
    }),
]);

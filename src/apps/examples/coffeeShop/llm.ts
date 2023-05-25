import { env } from "process";
import { Configuration, OpenAIApi } from "azure-openai";
import { success, error } from "./result";

const apiKey = env.OPENAI_API_KEY ?? "";
const endpoint = env.OPENAI_API_BASE ?? "";
const deploymentName = env.DEPLOYMENT_NAME ?? "";

export async function complete(prompt: string) {
    const config = new Configuration({ apiKey, azure: { apiKey, endpoint, deploymentName } });
    const openai = new OpenAIApi(config);
    const completion = await openai.createCompletion({
        model: deploymentName,
        prompt,
        max_tokens: 4000,
        temperature: 0.05,
        top_p: 1,
        best_of: 1,
    });
    return completion.status === 200 ?
        success(completion.data.choices[0].text ?? "") :
        error(`Error: ${completion.status}`);
}

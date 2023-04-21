import { Configuration, OpenAIApi } from "azure-openai";
import * as procss from "process";
const apiKey = procss.env.OPENAI_API_KEY;
const apiBase = procss.env.OPENAI_API_BASE;
const apiDeploymentName: string = process.env.DEPLOYMENT_NAME? process.env.DEPLOYMENT_NAME : "error";
console.log(`apiBase: ${apiBase}`);
console.log(`apiDeploymentName: ${apiDeploymentName}`);
console.log(`apiKey: ${apiKey}`)

const openai = new OpenAIApi(new Configuration({
    apiKey: apiKey,
    azure: {
        apiKey: apiKey,
        endpoint: apiBase,
        deploymentName: apiDeploymentName,
    } 
}));

export async function llmComplete(prompt: string, max_tokens = 4000) {
    const completion = await openai.createCompletion({
        model: apiDeploymentName,
        prompt: prompt,
        max_tokens: max_tokens,
        temperature: 0.05,
        top_p: 1,
        best_of: 1,
    });
    if (completion.status === 200) {   
        return completion.data.choices[0].text;
    }
    else {
        return(`Error: ${completion.status} `);
    }
    
}

import * as oai from "../src/openai";
import * as config from "../src/typechatConfig";
import { Embedding } from "../src/embeddings";

import {TestContext} from  "./testing";

export async function runTestsAsync(context : TestContext) : Promise<void> {

    let tcConfig : config.TypechatConfig = config.loadConfig("./tests/appConfig.json"); 
    let client : oai.OpenAIClient = new oai.OpenAIClient(tcConfig.embeddingModel);
    await testEmbeddings(context, client);
}
runTestsAsync.TestName = "OpenAI";

async function testEmbeddings(context : TestContext, client : oai.OpenAIClient) : Promise<void> {

    let texts : string[] = [

        "the quick brown fox jumps over the lazy dog",
        "He was born with a gift of laughter and a sense that the world was mad",
        "Far out in the uncharted backwaters of the unfashionable end of the western spiral arm of the Galaxy lies a small, unregarded yellow sun"
    ];
    let embeddings : Embedding[] = await client.createEmbeddings(texts);
    context.assertTrue(embeddings.length == texts.length);
    let x : Embedding = embeddings[0];
    for (let i = 1; i < embeddings.length; ++i) {
        x.cosineSimilarity(embeddings[i]);
    }
}


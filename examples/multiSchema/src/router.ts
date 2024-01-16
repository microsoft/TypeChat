import { MessageHandler, Agent } from "./agent";
import { Result, TypeChatLanguageModel, createJsonTranslator, TypeChatJsonTranslator } from "typechat";
import { TaskClassification, TaskClassificationResponse } from "./classificationSchema";

export interface AgentRouter<T extends object> {
    _taskTypes: TaskClassification[];
    _agentMap: { [name: string]: Agent<T> };
    _taskClassifier: TypeChatJsonTranslator<TaskClassificationResponse>
    _handlerUnknownTask: MessageHandler<T>;
    registerAgent(name: string, agent: Agent<T>): Promise<void>
    routeRequest(request: string): Promise<void>
}

export function createAgentRouter<T extends object>(model: TypeChatLanguageModel, schema: string, typename: string): AgentRouter<T> {
    
    const taskClassifier = createJsonTranslator<TaskClassificationResponse>(model, schema, typename);
    const router: AgentRouter<T> = {
        _taskTypes: [],
        _agentMap: {},
        _taskClassifier: taskClassifier,
        _handlerUnknownTask: handlerUnknownTask,
        registerAgent,
        routeRequest : routeRequest,
    };
    router._taskTypes.push({name: "No Match", description: "Handles all unrecognized requests"});
    return router;

    async function handlerUnknownTask(request: string): Promise<Result<T>> {
        console.log(`🤖The request "${request}" was not recognized by any agent.`);
        return { success: false, message: `The request "${request}" was not recognized by any agent.` };
    }

    async function registerAgent(name: string, agent: Agent<T>): Promise<void> {
        if (!router._agentMap[name]) {
            router._agentMap[name] = agent;

            // Add the agent's task type to the list of task types
            router._taskTypes.push({name: name, description: agent.description});
        }
        return;
    }

    async function routeRequest(request:string): Promise<void> {
        const initClasses: string = JSON.stringify(router._taskTypes, undefined, 2);
        const fullRequest: string = `
Classify "${request}" using the following classification table:\n
${initClasses}\n`;
        const response = await router._taskClassifier.translate(request, [{role: "assistant", content:`${fullRequest}`}]);
        if (response.success) {
            if (response.data.taskType != "No Match") {
                const agentName = response.data.taskType;
                console.log(`🤖The task will be handled by the ${agentName} Agent.`);
                const agent = router._agentMap[agentName];
                await agent.handleMessage(request);
            }
            else {
                router._handlerUnknownTask(request);
            }
        }
        else {
            console.log("🙈Sorry could not find an agent to handle your request.\n")
            console.log(`Context: ${response.message}`)
        }   
        return
    }
}
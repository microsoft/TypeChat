export function createProgramRequestPrompt(request: string, programSchema: string, apiSchema: string): string {
    return `You are a service that translates user requests into programs represented as JSON using the following TypeScript definitions:\n` +
        `\`\`\`\n${programSchema}\`\`\`\n` +
        `The programs can call functions from the API defined in the following TypeScript definitions:\n` +
        `\`\`\`\n${apiSchema}\`\`\`\n` +
        `The following is a user request encoded as a JSON string:\n` +
        `${JSON.stringify(request)}\n` +
        `The following is the user request translated into a JSON program object with 2 spaces of indentation and no properties with the value undefined:\n`;
}

export function createProgramRepairPrompt(validationError: string): string {
    return `The JSON program object is invalid. The following is the validation error encoded as a JSON string:\n` +
        `${JSON.stringify(validationError)}\n` +
        `The following is a revised JSON program object:\n`;
}
import { Result, error } from "./result";
import { TypeChatLanguageModel } from "./model";
import { TypeChatJsonValidator, createJsonValidator } from "./validate";

interface TypeChatJsonTranslator<T extends object> {
  model: TypeChatLanguageModel;
  validator: TypeChatJsonValidator<T>;
  attemptRepair: boolean;
  stripNulls: boolean;
  createRequestPrompt: (naturalLanguageRequest: string) => string;
  createRepairPrompt: (validationError: string) => string;
  translate: (naturalLanguageRequest: string) => Promise<Result<T>>;
}

function createJsonTranslator<T extends object>(
  model: TypeChatLanguageModel,
  schema: string,
  typeName: string
): TypeChatJsonTranslator<T> {
  const validator = createJsonValidator<T>(schema, typeName);

  const translator: TypeChatJsonTranslator<T> = {
    model,
    validator,
    attemptRepair: true,
    stripNulls: false,

    createRequestPrompt(naturalLanguageRequest) {
      return `
          You are a service that translates user requests into JSON objects of type "${this.validator.typeName}" according to the following TypeScript definitions:
          
          \`\`\`
          ${this.validator.schema}
          \`\`\`
          
          The following is a user request:
          
          """
          ${naturalLanguageRequest}
          """
          
          The following is the user request translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:
        `;
    },

    createRepairPrompt(validationError) {
      return `
          The JSON object is invalid for the following reason:
          
          """
          ${validationError}
          """
        
          The following is a revised JSON object:
        `;
    },

    async translate(naturalLanguageRequest) {
      let prompt = this.createRequestPrompt(naturalLanguageRequest);
      let attemptRepair = this.attemptRepair;

      while (true) {
        const response = await this.model.complete(prompt);

        if (!response.success) {
          return response;
        }

        const aiResponseText = response.data;
        const startIndex = aiResponseText.indexOf("{");
        const endIndex = aiResponseText.lastIndexOf("}");

        if (startIndex == -1 || endIndex == -1 || startIndex >= endIndex) {
          // invalid JSON, return error
        }

        const parsedJsonText = aiResponseText.slice(startIndex, endIndex + 1);

        const validation = this.validator.validate(parsedJsonText);

        if (validation.success) {
          return validation;
        }

        if (!attemptRepair) {
          return error(
            `JSON validation failed: ${validation.message}\n${parsedJsonText}`
          );
        }

        prompt += `${aiResponseText}\n${this.createRepairPrompt(
          validation.message
        )}`;

        attemptRepair = false;
      }
    },
  };

  return translator;
}

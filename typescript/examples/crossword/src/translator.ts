import {
  TypeChatLanguageModel,
  createJsonTranslator,
  TypeChatJsonTranslator,
  PromptSection,
} from "typechat";
import { TypeScriptJsonValidator } from "typechat/ts";

export function createCrosswordActionTranslator<T extends object>(
  model: TypeChatLanguageModel,
  validator: TypeScriptJsonValidator<T>,
  crosswordImage: string
): TypeChatJsonTranslator<T> {
  const translator = createJsonTranslator(model, validator);
  const schemaPrompt = translator.createSystemPrompt;
  translator.createSystemPrompt = () => `${schemaPrompt()}\n` +
    "Help the user interact with the crossword webpage using its layout. " +
    "Use the top left corner as (0,0), with x increasing to the right and y increasing down, in pixels.";

  if (crosswordImage) {
    const screenshot: PromptSection = { role: "user", content: [
      { type: "text", text: "Here is a screenshot of the currently visible webpage" },
      { type: "image_url", image_url: { url: crosswordImage, detail: "high" } },
    ] };
    const translate = translator.translate;
    translator.translate = (request, preamble) => {
      const context: PromptSection[] = typeof preamble === "string" ? [{ role: "user", content: preamble }] : preamble ?? [];
      return translate(request, [...context, screenshot]);
    };
  }
  return translator;
}

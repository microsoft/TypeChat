import {
  TypeChatLanguageModel,
  createJsonTranslator,
  TypeChatJsonTranslator,
  MultimodalPromptContent,
  PromptContent,
} from "typechat";
import { TypeScriptJsonValidator } from "typechat/ts";

export function createCrosswordActionTranslator<T extends object>(
  model: TypeChatLanguageModel,
  validator: TypeScriptJsonValidator<T>,
  crosswordImage: string
): TypeChatJsonTranslator<T> {
  const _imageContent = crosswordImage;

  const _translator = createJsonTranslator(model, validator);
  _translator.createRequestPrompt = createRequestPrompt

  return _translator;

  function createRequestPrompt(request: string): PromptContent {
    const screenshotSection = getScreenshotPromptSection(_imageContent);
    const contentSections = [
      {
        type: "text",
        text: "You are a virtual assistant that can help users to complete requests by interacting with the UI of a webpage.",
      },
      ...screenshotSection,
      {
        type: "text",
        text: `
                Use the layout information provided to answer user queries. 
                The responses should be translated into JSON objects of type ${_translator.validator.getTypeName()} using the typescript schema below:
                
                '''
                ${_translator.validator.getSchemaText()}
                '''
            `,
      },
      {
        type: "text",
        text: `
                The following is a user request:
                '''
                ${request}
                '''
                The following is the assistant's response translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:   
            `,
      },
    ] as MultimodalPromptContent[];

    return contentSections;
  }

  function getScreenshotPromptSection(screenshot: string | undefined) {
    let screenshotSection = [];
    if (screenshot) {
      screenshotSection.push({
        type: "text",
        text: "Here is a screenshot of the currently visible webpage",
      });

      screenshotSection.push({
        type: "image_url",
        image_url: {
          url: screenshot,
          detail: "high"
        },
      });

      screenshotSection.push({
        type: "text",
        text: `Use the top left corner as coordinate 0,0 and draw a virtual grid of 1x1 pixels, 
               where x values increase for each pixel as you go from left to right, and y values increase 
               as you go from top to bottom. 
            `,
      });
    }
    return screenshotSection;
  }
}

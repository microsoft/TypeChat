import assert from "assert";
import dotenv from "dotenv";
import findConfig from "find-config";
import fs from "fs";
import path from "path";
import { createJsonTranslator, createLanguageModel } from "typechat";
import { processRequests } from "typechat/interactive";
import { createTypeScriptJsonValidator } from "typechat/ts";
import { Drawing } from "./drawingSchema";
import { renderDrawingToSvg } from "./render";

const dotEnvPath = findConfig(".env");
assert(dotEnvPath, ".env file not found!");
dotenv.config({ path: dotEnvPath });

const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "drawingSchema.ts"), "utf8");
const validator = createTypeScriptJsonValidator<Drawing>(schema, "Drawing");
const translator = createJsonTranslator(model, validator);
const outputPath = path.join(__dirname, "drawing.svg");

const history: string[] = [];

// Process requests interactively or from the input file specified on the command line
processRequests("🎨> ", process.argv[2], async (request) => {
    history.push(request);
    const response = await translator.translate(history.join("\n"));
    if (!response.success) {
        console.log(response.message);
        return;
    }

    const drawing = response.data;
    console.log(JSON.stringify(drawing, undefined, 2));
    for (const item of drawing.items) {
        if (item.type === "UnknownText") {
            console.log(`Unknown text: ${item.text}`);
        }
    }

    fs.writeFileSync(outputPath, renderDrawingToSvg(drawing), "utf8");
    console.log(`Wrote ${outputPath}`);
});

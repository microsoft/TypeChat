import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createJsonTranslator, processRequests } from "typechat";
import { Classification, ClassificationResponse } from "./classificationSchema";

const classes: Classification[] = [
  {
    "name": "CoffeeShop",
    "description": "Order Coffee Drinks (Italian names included) and Baked Goods"
  },
  {
    "name": "Mystery Bookshop",
    "description": "A bookstore that specializes in mystery books"
  },
  {
    "name": "Bookstore",
    "description": "A bookstore that sells all kinds of books"
  },
  {
    "name": "Drugstore",
    "description": "A drugstore that sells health and beauty products"
  }
];

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "classificationSchema.ts"), "utf8");
const translator = createJsonTranslator<ClassificationResponse>(model, schema, "ClassificationResponse");

// Process requests interactively or from the input file specified on the command line
processRequests("🤗> ", process.argv[2], async (request) => {
    const initClasses: string = JSON.stringify(classes, undefined);
    const fullRequest: string = `Classify "${request}" using the following classification table:\n${initClasses}\n`;
    const response = await translator.translate(request, [{role: "assistant", content:`${fullRequest}`}]);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    console.log(`The classification is ${response.data.class.name}`);
});
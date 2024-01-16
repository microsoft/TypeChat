import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createJsonMathAgent, createJsonPrintAgent } from "./agent";
import {createLanguageModel, processRequests } from "typechat";
import { createAgentRouter } from "./router";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel(process.env);

const taskClassificationSchema = fs.readFileSync(path.join(__dirname, "classificationSchema.ts"), "utf8");
const router = createAgentRouter(model, taskClassificationSchema, "TaskClassificationResponse")

const sentimentSchema = fs.readFileSync(path.join(__dirname, "sentimentSchema.ts"), "utf8");
const sentimentAgent = createJsonPrintAgent
    ("Sentiment",
    "Statements with sentiments, emotions, feelings, impressions about places, things, the surroundings",
    model, sentimentSchema, "SentimentResponse"
);
router.registerAgent("Sentiment", sentimentAgent);

const coffeeShopSchema  = fs.readFileSync(path.join(__dirname, "coffeeShopSchema.ts"), "utf8");
const coffeeShopAgent = createJsonPrintAgent(
    "CoffeeShop",
    "Order Coffee Drinks (Italian names included) and Baked Goods",
    model, coffeeShopSchema, "Cart"
);
router.registerAgent("CoffeeShop", coffeeShopAgent);

const calendarSchema  = fs.readFileSync(path.join(__dirname, "calendarActionsSchema.ts"), "utf8");
const calendarAgent = createJsonPrintAgent(
    "Calendar",
    "Actions related to calendars, appointments, meetings, schedules",
    model, calendarSchema, "CalendarActions"
);
router.registerAgent("Calendar", calendarAgent);

const orderSchema  = fs.readFileSync(path.join(__dirname, "foodOrderViewSchema.ts"), "utf8");
const restaurantOrderAgent = createJsonPrintAgent(
    "Restaurant",
    "Order pizza, beer and salads",
    model, orderSchema, "Order"
);
router.registerAgent("Restaurant", restaurantOrderAgent);

const mathSchema  = fs.readFileSync(path.join(__dirname, "mathSchema.ts"), "utf8");
const mathAgent = createJsonMathAgent(
    "Math",
    "Calculations using the four basic math operations",
    model, mathSchema
);
router.registerAgent("Math", mathAgent);


// Process requests interactively or from the input file specified on the command line
processRequests("🔀> ", process.argv[2], async (request) => {
    await router.routeRequest(request);
});
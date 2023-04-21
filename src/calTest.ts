// import the node fs api
import * as fs from 'fs';
// import the node path api
import * as path from 'path';
import { runTests } from './typechat';

const schemaFilename = "../src/calendarActions.d.ts";
// open schema file containing ts definitions
const schemaText = fs.readFileSync(path.join(__dirname, schemaFilename), 'utf8');

function todaysDate() {
    const d = new Date();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
}

const typeInterp = "the list of requested calendar actions";
const frame = `a bot is helping a person work with a calendar. today is ${todaysDate()}`;

const testPrompts = [
    "I need to get my tires changed from 12:00 to 2:00 pm on Friday March 15, 2024",
    "Search for any meetings with Gavin this week",
    "Set up an event for friday named Jeffs pizza party at 6pm",
    "Please add Jennifer to the scrum next Thursday",
    "Will you please add an appointment with Jerri Skinner at 9 am?  I need it to last 2 hours",
    "Do I have any plan with Rosy this month?",
    "I need to add a meeting with my boss on Monday at 10am. Also make sure to schedule and appointment with Sally, May, and Boris tomorrow at 3pm. Now just add to it Jesse and Abby and make it last ninety minutes",
    "Add meeting with team today at 2",
    "can you record lunch with cookie at 12pm on Friday and also add Isobel to the Wednesday ping pong game at 4pm",
]

export async function calendarTests() {
    return await runTests(testPrompts, "CalendarActions", typeInterp, frame, schemaText, 2);
}
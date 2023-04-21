import { calendarTests } from "./calTest";
import { pizzaTests } from "./pizzaTest";

async function testPrompts() {
    await pizzaTests();
    await calendarTests();
}

testPrompts();
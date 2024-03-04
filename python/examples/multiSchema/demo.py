import os
import sys

examples_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if examples_path not in sys.path:
    sys.path.append(examples_path)

import asyncio
from dotenv import dotenv_values
from typechat import create_language_model, process_requests

from router import TextRequestRouter
from agents import MathAgent, JsonPrintAgent, MusicAgent
import examples.restaurant.schema as restaurant
import examples.calendar.schema as calendar
import examples.coffeeShop.schema as coffeeShop
import examples.sentiment.schema as sentiment


async def handle_unknown(_line: str):
    print("The input did not match any registered agents")

async def main():
    env_vals = dotenv_values()
    model = create_language_model(env_vals)
    router = TextRequestRouter(model=model)

    # register agents
    math_agent = MathAgent(model=model)
    router.register_agent(
        name="Math", description="Calculations using the four basic math operations", handler=math_agent.handle_request
    )

    music_agent = MusicAgent(model=model, authentication_vals=env_vals)
    await music_agent.authenticate()
    router.register_agent(
        name="Music Player",
        description="Actions related to music, podcasts, artists, and managing music libraries",
        handler=music_agent.handle_request,
    )

    coffee_agent = JsonPrintAgent(model=model, target_type=coffeeShop.Cart)
    router.register_agent(
        name="CoffeeShop",
        description="Order Coffee Drinks (Italian names included) and Baked Goods",
        handler=coffee_agent.handle_request,
    )

    calendar_agent = JsonPrintAgent(model=model, target_type=calendar.CalendarActions)
    router.register_agent(
        name="Calendar",
        description="Actions related to calendars, appointments, meetings, schedules",
        handler=calendar_agent.handle_request,
    )

    restaurant_agent = JsonPrintAgent(model=model, target_type=restaurant.Order)
    router.register_agent(
        name="Restaurant", description="Order pizza, beer and salads", handler=restaurant_agent.handle_request
    )

    sentiment_agent = JsonPrintAgent(model=model, target_type=sentiment.Sentiment)
    router.register_agent(
        name="Sentiment",
        description="Statements with sentiments, emotions, feelings, impressions about places, things, the surroundings",
        handler=sentiment_agent.handle_request,
    )

    # register a handler for unknown results
    router.register_agent(name="No Match", description="Handles all unrecognized requests", handler=handle_unknown)

    async def request_handler(message: str):
        await router.route_request(message)

    file_path = sys.argv[1] if len(sys.argv) == 2 else None
    await process_requests("🔀> ", file_path, request_handler)


if __name__ == "__main__":
    asyncio.run(main())
